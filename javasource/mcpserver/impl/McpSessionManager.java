package mcpserver.impl;

import java.util.Collections;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

import javax.servlet.http.HttpServletRequest;

import com.mendix.core.Core;
import com.mendix.core.CoreException;
import com.mendix.systemwideinterfaces.core.IContext;
import com.mendix.systemwideinterfaces.core.IDataType;
import com.mendix.systemwideinterfaces.core.IMendixObject;
import com.mendix.systemwideinterfaces.core.ISession;
import com.mendix.systemwideinterfaces.core.IUser;

import io.modelcontextprotocol.server.McpSyncServerExchange;
import io.modelcontextprotocol.spec.McpServerSession;
import io.modelcontextprotocol.spec.McpServerTransport;
import mcpserver.proxies.McpServer;
import system.proxies.HttpHeader;
import system.proxies.HttpRequest;
import system.proxies.User;

public class McpSessionManager 
{
	private static final MxLogger LOGGER = new mcpserver.impl.MxLogger(McpSessionManager.class);
	
	/** Map of active client sessions, keyed by MCP session ID */
    private final Map<String, McpServerSession> sessions;
    
    /** Map from SDK internal session ID to MCP session ID */
    private final Map<String, String> internalToExternalSessionMap;
    
    /** Map from MCP session ID to Mendix session ID (for user authentication) */
    private final Map<String, String> mcpToMendixSessionMap;

    /** Map from MCP session ID to the username that initialized it. Kept separately from the Mendix
     *  session so ownership can still be verified after the Mendix session has expired. */
    private final Map<String, String> mcpSessionOwnerMap;

    /** Session factory for creating new sessions */
    private McpServerSession.Factory sessionFactory;

    private final McpServer mcpServer;

	public McpSessionManager(McpServer mcpServer)	{
		this.mcpServer = mcpServer;
		sessions = new ConcurrentHashMap<>();
		internalToExternalSessionMap = new ConcurrentHashMap<>();
		mcpToMendixSessionMap = new ConcurrentHashMap<>();
		mcpSessionOwnerMap = new ConcurrentHashMap<>();
		LOGGER.debug("New McpSessionManager created: " + System.identityHashCode(this));
	}
	
	public void setSessionFactory(McpServerSession.Factory sessionFactory) {
		this.sessionFactory = sessionFactory;
	}
	
	public void createSession(String sessionId, McpServerTransport sessionTransport) throws Exception {
		if(sessionFactory == null)
			throw new Exception("Trying to create a session while sessionFactory is not initialized");
		
		McpServerSession session = sessionFactory.create(sessionTransport);
        sessions.put(sessionId, session);
        internalToExternalSessionMap.put(session.getId(), sessionId);
	}
	
	/**
	 * Associates a Mendix session ID with an MCP session ID and records the user as the session owner.
	 * This allows tool/prompt calls to execute with the authenticated user's context.
	 */
	public void setMendixSessionForMcpSession(String mcpSessionId, String mendixSessionId) {
		if (mendixSessionId != null && mcpSessionId != null) {
			mcpToMendixSessionMap.put(mcpSessionId, mendixSessionId);
			String ownerUsername = getUsernameForMendixSession(mendixSessionId);
			if (ownerUsername != null) {
				mcpSessionOwnerMap.put(mcpSessionId, ownerUsername);
			}
			LOGGER.debug("Associated MCP session " + mcpSessionId + " with Mendix session " + mendixSessionId);
		}
	}
	
	public McpServerSession getSession(String sessionId) {
		return sessions.get(sessionId);
	}
	
	public boolean hasSessions() {
		return !sessions.isEmpty();
	}
	
	public int getNumberOfSessions() {
		return sessions.values().size();
	}
	
	public Iterable<McpServerSession> getAllSessions() {
		return sessions.values();
	}
	
	public ISession getMxRuntimeSession(McpSyncServerExchange exchange) throws Exception {
		LOGGER.debug("Looking up Mendix session for SDK session: " + exchange.sessionId());
		
		// Map SDK internal session ID -> MCP session ID
		String mcpSessionId = internalToExternalSessionMap.get(exchange.sessionId());
		
		// Map MCP session ID -> Mendix session ID
		if (mcpSessionId != null) {
			String mendixSessionId = mcpToMendixSessionMap.get(mcpSessionId);
			LOGGER.debug("Mendix session ID from mapping: " + mendixSessionId);
			if (mendixSessionId != null) {
				return getMxRuntimeSessionForSessionId(mendixSessionId);
			}
		}
		
		LOGGER.debug("No Mendix session found for SDK session: " + exchange.sessionId());
		return null;
	}

	/**
	 * Returns a context object for the tool or prompt microflow.
	 * If authentication is configured, a valid user session is required and an exception is thrown if none is found.
	 * Only if no authentication is configured, a system context is returned.
	 * @param exchange
	 * @return Context object
	 * @throws Exception if authentication is configured but no valid user session exists
	 */
	public IContext getContextFromSession(McpSyncServerExchange exchange) throws Exception {
		try {
			ISession session = this.getMxRuntimeSession(exchange);
			if (session != null) {
				LOGGER.debug("Using user context for session: " + session.getId());
				return session.createContext();
			}
		} catch (Exception e) {
			LOGGER.warn("Could not retrieve user session: " + e.getMessage());
		}

		if (isAuthenticationRequired(mcpServer)) {
			throw new Exception("No valid Mendix user session found for MCP session; refusing to execute in system context");
		}

		LOGGER.debug("No authentication configured, using system context");
		return Core.createSystemContext();
	}
	
	private ISession getMxRuntimeSessionForSessionId(String sessionId) {
		return Core.getSessionById(UUID.fromString(sessionId));
	}
	
	public void closeSession(String mcpSessionId) {
		McpServerSession session = sessions.get(mcpSessionId);
		
		if(session != null) {
			session.closeGracefully();
			sessions.remove(mcpSessionId);
			
			// Clean up internal session ID mapping
			internalToExternalSessionMap.remove(session.getId());
			mcpSessionOwnerMap.remove(mcpSessionId);

			// Clean up and logout Mendix session if present
			String mendixSessionId = mcpToMendixSessionMap.remove(mcpSessionId);
			if (mendixSessionId != null) {
				ISession mxRuntimeSession = getMxRuntimeSessionForSessionId(mendixSessionId);
				if (mxRuntimeSession != null) {
					LOGGER.debug("Closing Mendix user session: " + mendixSessionId);
					Core.logout(mxRuntimeSession);
				}
			}
		}
		else {
			LOGGER.debug(String.format("Closing session with id %s, but no session was found", mcpSessionId));
		}
	}
	
	/**
	 * Logs out a Mendix session by its ID.
	 * Used for cleanup when MCP session creation fails after Mendix session was already created.
	 * @param mendixSessionId The Mendix session ID to logout
	 */
	public void logoutMendixSession(String mendixSessionId) {
		if (mendixSessionId != null) {
			try {
				ISession mxRuntimeSession = getMxRuntimeSessionForSessionId(mendixSessionId);
				if (mxRuntimeSession != null) {
					LOGGER.debug("Logging out Mendix session: " + mendixSessionId);
					Core.logout(mxRuntimeSession);
				}
			} catch (Exception e) {
				LOGGER.warn("Failed to logout Mendix session " + mendixSessionId + ": " + e.getMessage());
			}
		}
	}
	
	/**
	 * Authenticates a user via the configured authentication microflow and returns the Mendix session ID.
	 * Returns null if authentication fails or no authentication is configured.
	 */
	public String authenticateAndCreateMendixSession(HttpServletRequest httpServletRequest, McpServer mcpServer) throws CoreException {
		String authMicroflow = mcpServer.getAuthenticationMicroflow();
		if (authMicroflow == null || authMicroflow.isEmpty()) {
			LOGGER.debug("No authentication microflow configured, will use system context");
			return null;
		}
		
		// Create new Mendix session via authentication microflow
		ISession iSession = createSessionForUser(httpServletRequest, mcpServer);
		if (iSession != null) {
			LOGGER.debug("Created Mendix session for authenticated user: " + iSession.getId());
			return iSession.getId().toString();
		}
		
		LOGGER.debug("Authentication failed, no Mendix session created");
		return null;
	}
	
	/**
	 * Authenticates a user via the configured authentication microflow and returns the username.
	 * Does NOT create a Mendix session - use this for validating credentials only.
	 * Returns null if authentication fails or no authentication is configured.
	 */
	public String authenticateAndGetUsername(HttpServletRequest httpServletRequest, McpServer mcpServer) throws CoreException {
		String authMicroflow = mcpServer.getAuthenticationMicroflow();
		if (authMicroflow == null || authMicroflow.isEmpty()) {
			LOGGER.debug("No authentication microflow configured");
			return null;
		}
		
		IContext systemContext = Core.createSystemContext();
		Map<String, Object> microflowArgs = mapInputParametersAuthentication(mcpServer,
		     createHttpRequestMx(httpServletRequest, systemContext));
		
		IMendixObject userIMx = Core.microflowCall(mcpServer.getAuthenticationMicroflow())
		        .withParams(microflowArgs)
		        .execute(systemContext);
		
		if (userIMx == null) {
			return null;
		}
		
		User user = User.initialize(systemContext, userIMx);
		IUser iUser = Core.getUser(systemContext, user.getName());

		if (iUser == null || !iUser.isActive() || iUser.isBlocked()) {
			return null;
		}

		return user.getName();
	}
	
	/**
	 * Gets the username associated with a Mendix session ID.
	 * Returns null if session not found or invalid.
	 */
	public String getUsernameForMendixSession(String mendixSessionId) {
		if (mendixSessionId == null) {
			return null;
		}
		
		try {
			ISession session = getMxRuntimeSessionForSessionId(mendixSessionId);
			if (session != null) {
				IContext context = session.createContext();
				IUser user = session.getUser(context);
				if (user != null) {
					return user.getName();
				}
			}
		} catch (Exception e) {
			LOGGER.debug("Could not get username for Mendix session: " + e.getMessage());
		}
		return null;
	}
	
	/**
	 * Gets the username of the user that initialized the MCP session.
	 * Returns null if the session was never associated with an authenticated user.
	 */
	public String getOwnerForMcpSession(String mcpSessionId) {
		return mcpSessionOwnerMap.get(mcpSessionId);
	}

	/**
	 * Checks whether the Mendix session associated with the MCP session is still active and, if so,
	 * refreshes its timeout so that an MCP client in active use does not lose its user session.
	 * Returns false if no Mendix session is associated or it has expired.
	 */
	public boolean keepMendixSessionAlive(String mcpSessionId) {
		String mendixSessionId = mcpToMendixSessionMap.get(mcpSessionId);
		if (mendixSessionId == null) {
			return false;
		}
		ISession mxRuntimeSession = getMxRuntimeSessionForSessionId(mendixSessionId);
		if (mxRuntimeSession == null) {
			return false;
		}
		try {
			mxRuntimeSession.keepAlive();
		} catch (CoreException e) {
			// The session itself is still valid, only its timeout could not be refreshed
			LOGGER.warn("Failed to refresh Mendix session " + mendixSessionId + ": " + e.getMessage());
		}
		return true;
	}
	
	/**
	 * Checks if authentication is required for the given MCP server.
	 */
	public boolean isAuthenticationRequired(McpServer mcpServer) {
		String authMicroflow = mcpServer.getAuthenticationMicroflow();
		return authMicroflow != null && !authMicroflow.isEmpty();
	}
	
	/**
	 * Creates a Mendix session for a user via authentication microflow.
	 */
	private ISession createSessionForUser(HttpServletRequest httpServletRequest, McpServer mcpServer) throws CoreException {
		IContext systemContext = Core.createSystemContext();
		Map<String, Object> microflowArgs = mapInputParametersAuthentication(mcpServer,
		     createHttpRequestMx(httpServletRequest, systemContext));
		
		IMendixObject userIMx = Core.microflowCall(mcpServer.getAuthenticationMicroflow())
		        .withParams(microflowArgs)
		        .execute(systemContext);
		
		if (userIMx == null) {
			return null;
		}
		
		User user = User.initialize(systemContext, userIMx);
		IUser iUser = Core.getUser(systemContext, user.getName());

		if (iUser == null || !iUser.isActive() || iUser.isBlocked()) {
			return null;
		}

		return Core.initializeSession(iUser, null);
	}
	
	/**
	 * Creates a Mendix HttpRequest object from servlet request.
	 */
	private HttpRequest createHttpRequestMx(HttpServletRequest httpServletRequest, IContext iContext) {
		HttpRequest httpRequestMx = new HttpRequest(iContext);
		
		Collections.list(httpServletRequest.getHeaderNames())
		        .forEach(headerName -> {
		            String headerValue = httpServletRequest.getHeader(headerName);
		            setHttpHeader(httpRequestMx, headerName, headerValue);
		        });
		
		return httpRequestMx;
	}
	
	/**
	 * Sets an HTTP header in the Mendix HttpRequest object.
	 */
	private void setHttpHeader(HttpRequest httpRequestMx, String key, String value) {
		system.proxies.HttpHeader httpHeader = new HttpHeader(httpRequestMx.getContext());
		httpHeader.setKey(key);
		httpHeader.setValue(value);
		httpHeader.setHttpHeaders(httpRequestMx);
	}
	
	/**
	 * Maps input parameters for authentication microflow.
	 */
	private Map<String, Object> mapInputParametersAuthentication(McpServer mcpServer, HttpRequest httpRequest) {
		Map<String, Object> inputParameters = new java.util.HashMap<>();
		Map<String, IDataType> parametersAndTypes = Core.getInputParameters(mcpServer.getAuthenticationMicroflow());
		parametersAndTypes.forEach((t, u) -> {
			if (Core.getMetaObject(u.getObjectType()).isSubClassOf(mcpserver.proxies.McpServer.getType())) {
				inputParameters.put(t, mcpServer.getMendixObject());
			} else if (Core.getMetaObject(u.getObjectType()).isSubClassOf(HttpRequest.getType())) {
				inputParameters.put(t, httpRequest.getMendixObject());
			}
		});
		return inputParameters;
	}
}
