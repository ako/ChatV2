package mcpserver.impl;

import io.modelcontextprotocol.json.McpJsonDefaults;
import io.modelcontextprotocol.json.McpJsonMapper;
import io.modelcontextprotocol.json.TypeRef;
import com.mendix.core.CoreException;
import com.mendix.m2ee.api.IMxRuntimeRequest;
import com.mendix.m2ee.api.IMxRuntimeResponse;

import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;
import java.io.BufferedReader;
import java.io.IOException;
import java.util.Map;
import java.util.concurrent.atomic.AtomicBoolean;
import reactor.core.publisher.Mono;

import io.modelcontextprotocol.spec.*;
import mcpserver.proxies.McpServer;

/**
 * Streamable HTTP transport handler for MCP protocol.
 * Implements the Streamable HTTP protocol version (2025-03-26) for bidirectional communication.
 * Uses a single /mcp endpoint for all operations (POST and DELETE).
 * Session identification via Mcp-Session-Id header.
 */
public class McpTransportHandler {
    
    private static final MxLogger LOGGER = new MxLogger(McpTransportHandler.class);
    private static final McpJsonMapper MAPPER = McpJsonDefaults.getMapper();
    
    public static final String UTF_8 = "UTF-8";
    public static final String APPLICATION_JSON = "application/json";
    public static final String TEXT_EVENT_STREAM = "text/event-stream";
    public static final String SESSION_HEADER = "Mcp-Session-Id";  // Streamable HTTP uses Mcp-Session-Id
    // OAuth 2.0 Protected Resource Metadata (RFC 9728), served relative to the MCP server path
    public static final String PROTECTED_RESOURCE_METADATA_PATH = ".well-known/oauth-protected-resource";

    private final McpServer mcpServer;
    private final McpSessionManager sessionManager;
    private McpServerSession.Factory sessionFactory;
    private final AtomicBoolean isClosing = new AtomicBoolean(false);
    private final Map<String, StreamableHttpSessionTransport> transports = new java.util.concurrent.ConcurrentHashMap<>();
    
    /**
     * Creates a new Streamable HTTP transport handler.
     * Streamable HTTP uses a single /mcp endpoint for all POST operations.
     * @param mcpServer The MCP server configuration (must not be null)
     * @param sessionManager The session manager instance for this MCP server
     * @throws IllegalArgumentException if mcpServer or sessionManager is null
     */
    public McpTransportHandler(McpServer mcpServer, McpSessionManager sessionManager) {
        if (mcpServer == null) {
            throw new IllegalArgumentException("mcpServer cannot be null");
        }
        if (sessionManager == null) {
            throw new IllegalArgumentException("sessionManager cannot be null");
        }
        this.mcpServer = mcpServer;
        this.sessionManager = sessionManager;
        LOGGER.debug("McpTransportHandler created with SessionManager: " + System.identityHashCode(sessionManager));
    }
    
    public boolean canHandlePath(String path) {
        return path.endsWith("mcp");
    }

    public boolean isProtectedResourceMetadataPath(String path) {
        return path.endsWith(PROTECTED_RESOURCE_METADATA_PATH);
    }

    /**
     * Serves the OAuth 2.0 Protected Resource Metadata document (RFC 9728) that tells MCP clients
     * which authorization server issues access tokens for this MCP server.
     * Returns 404 if no authorization server is configured.
     */
    public void handleProtectedResourceMetadata(IMxRuntimeResponse response) throws IOException {
        HttpServletResponse httpResponse = response.getHttpServletResponse();
        if (!isOAuthEnabled()) {
            httpResponse.sendError(HttpServletResponse.SC_NOT_FOUND, "Endpoint not found");
            return;
        }

        Map<String, Object> metadata = new java.util.LinkedHashMap<>();
        // Must be identical to the URL the client connects to, clients reject the metadata otherwise
        metadata.put("resource", mcpServer.getEndpoint());
        metadata.put("authorization_servers", java.util.List.of(mcpServer.getAuthorizationServerUrl()));
        metadata.put("bearer_methods_supported", java.util.List.of("header"));
        // Without scopes, clients fall back to requesting the scopes advertised by the authorization server
        String scopes = getScopes();
        if (scopes != null) {
            metadata.put("scopes_supported", java.util.List.of(scopes.split(" ")));
        }
        metadata.put("resource_name", mcpServer.getName());

        httpResponse.setStatus(HttpServletResponse.SC_OK);
        setStreamableHttpResponseHeaders(httpResponse);
        httpResponse.getOutputStream().write(MAPPER.writeValueAsString(metadata).getBytes(UTF_8));
        httpResponse.getOutputStream().flush();
        httpResponse.flushBuffer();
    }

    public void setSessionFactory(McpServerSession.Factory sessionFactory) {
        this.sessionFactory = sessionFactory;
        // Also register with session manager for session persistence
        sessionManager.setSessionFactory(sessionFactory);
    }
    
    public void handleHead(IMxRuntimeRequest request, IMxRuntimeResponse response, String path) throws Exception {
        HttpServletResponse httpResponse = response.getHttpServletResponse();
        setStreamableHttpResponseHeaders(httpResponse);
        httpResponse.setStatus(HttpServletResponse.SC_OK);
    }
    
    public void handleGet(IMxRuntimeRequest request, IMxRuntimeResponse response, String path) throws Exception {
        HttpServletResponse httpResponse = response.getHttpServletResponse();
        httpResponse.sendError(HttpServletResponse.SC_METHOD_NOT_ALLOWED, 
                              "Streamable HTTP only supports POST and DELETE on /mcp endpoint");
    }
    
    public void handlePost(IMxRuntimeRequest request, IMxRuntimeResponse response, String path) throws Exception {
        HttpServletRequest httpRequest = request.getHttpServletRequest();
        HttpServletResponse httpResponse = response.getHttpServletResponse();
        
        // Check if server is shutting down
        if (isClosing.get()) {
            httpResponse.sendError(HttpServletResponse.SC_SERVICE_UNAVAILABLE, "Server is shutting down");
            return;
        }
        
        // Validate endpoint path
        if (!path.endsWith("mcp")) {
            httpResponse.sendError(HttpServletResponse.SC_NOT_FOUND, "Streamable HTTP only accepts POST on /mcp");
            return;
        }
        
        McpServerSession session;
        StreamableHttpSessionTransport sessionTransport;
        
        try {
            // Read and deserialize the message first, so the JSON-RPC method is known before
            // deciding whether a session may be created or must already exist.
            String bodyString = readRequestBody(httpRequest);
            LOGGER.debug("Received request body: " + bodyString);
            McpSchema.JSONRPCMessage message = deserializeJsonRpcMessage(bodyString);
            String messageType = message.getClass().getSimpleName();
            LOGGER.debug("Processing message type: " + messageType);
            
            String method = (message instanceof McpSchema.JSONRPCRequest)
                    ? ((McpSchema.JSONRPCRequest) message).method() : null;
            boolean isInitialize = "initialize".equals(method);
            
            // Only "initialize" may establish a brand new session; every other method must
            // reference an existing, already-initialized session
            String sessionId = httpRequest.getHeader(SESSION_HEADER);
            if (isInitialize) {
                // The server always assigns the session ID, a client-provided ID is never adopted
                sessionId = java.util.UUID.randomUUID().toString();
                LOGGER.debug("Initialize request, generated new session ID: " + sessionId);
            } else if (sessionId == null || sessionId.isEmpty()) {
                sendSessionRequiredError(httpResponse, message);
                return;
            } else if (sessionManager.getSession(sessionId) == null) {
                LOGGER.debug("Unknown session ID provided: " + sessionId);
                sendSessionNotFoundError(httpResponse, message);
                return;
            }
            
            // Authenticate before entering the synchronized block below: the authentication microflow may
            // call external services (e.g. token introspection) and must not block requests of other sessions
            String mendixSessionId = null;
            if (isInitialize) {
                // New MCP session - authenticate and create Mendix session if authentication is configured
                mendixSessionId = getSessionId(httpRequest, mcpServer);

                // Never create an MCP session without a user when authentication is configured,
                // otherwise tool calls in that session would have no user to execute as
                if (mendixSessionId == null && sessionManager.isAuthenticationRequired(mcpServer)) {
                    LOGGER.debug("Authentication failed for initialize request, no session created");
                    sendUnauthorized(httpRequest, httpResponse);
                    return;
                }
            } else if (sessionManager.isAuthenticationRequired(mcpServer)) {
                // Existing MCP session - always validate credentials on every request for security
                String authenticatedUsername = sessionManager.authenticateAndGetUsername(httpRequest, mcpServer);

                if (authenticatedUsername == null) {
                    // Authentication failed - reject request
                    LOGGER.debug("Authentication failed for session: " + sessionId);
                    sendUnauthorized(httpRequest, httpResponse);
                    return;
                }

                // Check if the authenticated user matches the session owner
                String sessionOwnerUsername = sessionManager.getOwnerForMcpSession(sessionId);

                if (sessionOwnerUsername == null || !sessionOwnerUsername.equals(authenticatedUsername)) {
                    // No owner or different user's credentials provided for this session. Respond as if the
                    // session does not exist: the client re-initializes as the authenticated user, and the
                    // response does not reveal that the session exists. The owner's session is left intact.
                    LOGGER.warn("Session " + sessionId + " belongs to user '" + sessionOwnerUsername +
                               "' but credentials provided are for user '" + authenticatedUsername + "'");
                    sendSessionNotFoundError(httpResponse, message);
                    return;
                }

                // The Mendix session may have timed out while the MCP session was idle. Close the MCP
                // session and return 404 so the client re-initializes and gets a new user session.
                if (!sessionManager.keepMendixSessionAlive(sessionId)) {
                    LOGGER.info("Mendix session for MCP session " + sessionId + " has expired, closing MCP session");
                    synchronized (transports) {
                        sessionManager.closeSession(sessionId);
                        transports.remove(sessionId);
                    }
                    sendSessionNotFoundError(httpResponse, message);
                    return;
                }

                LOGGER.debug("Credentials validated for existing session: " + sessionId + ", user: " + authenticatedUsername);
            }

            // Get or create session and transport (atomic operation)
            synchronized (transports) {
                session = sessionManager.getSession(sessionId);

                if (isInitialize) {
                    // Create new session with transport atomically
                    sessionTransport = new StreamableHttpSessionTransport(sessionId, httpResponse);
                    transports.put(sessionId, sessionTransport);
                    try {
                        sessionManager.createSession(sessionId, sessionTransport);
                        session = sessionManager.getSession(sessionId);
                        httpResponse.setHeader(SESSION_HEADER, sessionId);
                        
                        // Associate the Mendix session with this MCP session (for authenticated user context)
                        if (mendixSessionId != null) {
                            sessionManager.setMendixSessionForMcpSession(sessionId, mendixSessionId);
                        }
                        
                        LOGGER.debug("Created new session: " + sessionId);
                    } catch (Exception e) {
                        transports.remove(sessionId);
                        // Clean up the Mendix session if we created one but failed to create MCP session
                        if (mendixSessionId != null) {
                            sessionManager.logoutMendixSession(mendixSessionId);
                        }
                        LOGGER.error("Failed to create session: " + sessionId, e);
                        sendJsonError(httpResponse, HttpServletResponse.SC_INTERNAL_SERVER_ERROR,
                                     "Failed to create session: " + e.getMessage());
                        return;
                    }
                } else {
                    // The session may have been closed (e.g. by a DELETE) while this request was being authenticated
                    if (session == null) {
                        LOGGER.debug("Session closed during authentication: " + sessionId);
                        sendSessionNotFoundError(httpResponse, message);
                        return;
                    }

                    // Credentials valid (or no auth required) - reuse existing session
                    sessionTransport = transports.get(sessionId);
                    if (sessionTransport == null) {
                        LOGGER.error("Transport not found for session: " + sessionId);
                        sendJsonError(httpResponse, HttpServletResponse.SC_INTERNAL_SERVER_ERROR, 
                                     "Internal error: transport not found for session");
                        return;
                    }
                    LOGGER.debug("Using existing session: " + sessionId);
                }
            }
            
            // Extract request ID and register this request with its response object
            Object requestId = null;
            if (message instanceof McpSchema.JSONRPCRequest) {
                requestId = ((McpSchema.JSONRPCRequest) message).id();
                sessionTransport.registerRequest(requestId, httpResponse);
            }
            
            try {
                // Check if this is a request for an unsupported optional method
                // Return empty success response immediately so clients can continue
                if (message instanceof McpSchema.JSONRPCRequest) {
                    McpSchema.JSONRPCRequest jsonRpcRequest = (McpSchema.JSONRPCRequest) message;
                    
                    if (isUnsupportedOptionalMethod(method)) {
                        LOGGER.debug("Unsupported optional method: " + method + ", returning empty success response");
                        McpSchema.JSONRPCResponse emptyResponse = new McpSchema.JSONRPCResponse(
                            McpSchema.JSONRPC_VERSION,
                            jsonRpcRequest.id(),
                            java.util.Collections.emptyMap(),
                            null
                        );
                        sessionTransport.sendMessage(emptyResponse).block();
                        LOGGER.debug("Message handled successfully");
                        return;
                    }
                }
                
                // Handle supported methods through the SDK
                LOGGER.debug("Calling session.handle() for message");
                try {
                    session.handle(message)
                        .timeout(java.time.Duration.ofSeconds(30))
                        .block();
                    // Notifications and responses get no JSON-RPC reply; the spec requires 202 Accepted without a body
                    if (!(message instanceof McpSchema.JSONRPCRequest) && !httpResponse.isCommitted()) {
                        httpResponse.setStatus(HttpServletResponse.SC_ACCEPTED);
                    }
                } catch (Exception handleEx) {
                    LOGGER.warn("session.handle() failed or timed out: " + handleEx.getMessage());
                    // If no response was sent and this is a request, send an error
                    if (message instanceof McpSchema.JSONRPCRequest && !sessionTransport.wasMessageSent(requestId)) {
                        McpSchema.JSONRPCRequest jsonRpcRequest = (McpSchema.JSONRPCRequest) message;
                        McpSchema.JSONRPCResponse errorResponse = new McpSchema.JSONRPCResponse(
                            McpSchema.JSONRPC_VERSION,
                            jsonRpcRequest.id(),
                            null,
                            // do not leak internal exception details (class names, stack traces) to clients
                            new McpSchema.JSONRPCResponse.JSONRPCError(-32603, "Internal error while processing request", null)
                        );
                        sessionTransport.sendMessage(errorResponse).block();
                    } else if (!(message instanceof McpSchema.JSONRPCRequest)) {
                        sendJsonError(httpResponse, HttpServletResponse.SC_INTERNAL_SERVER_ERROR,
                                     "Internal error while processing message");
                    }
                }

                LOGGER.debug("Message handled successfully for request: " + requestId);
                
            } finally {
                // Unregister request after completion
                if (requestId != null) {
                    sessionTransport.unregisterRequest(requestId);
                }
            }
            
        } catch (Exception e) {
            LOGGER.error("Error processing MCP message: " + e.getMessage(), e);
            if (!httpResponse.isCommitted()) {
                sendJsonError(httpResponse, HttpServletResponse.SC_INTERNAL_SERVER_ERROR, e.getMessage());
            }
        }
    }
    
    public void handleDelete(IMxRuntimeRequest request, IMxRuntimeResponse response, String path) throws Exception {
        HttpServletRequest httpRequest = request.getHttpServletRequest();
        HttpServletResponse httpResponse = response.getHttpServletResponse();
        
        if (!path.endsWith("mcp")) {
            LOGGER.warn("DELETE rejected - path does not end with 'mcp': " + path);
            httpResponse.sendError(HttpServletResponse.SC_NOT_FOUND, "DELETE only accepted on /mcp");
            return;
        }
        
        // Get session ID from Mcp-Session-Id header
        String sessionId = httpRequest.getHeader(SESSION_HEADER);
        LOGGER.debug("DELETE - Session ID from header: " + sessionId);
        
        if (sessionId == null || sessionId.isEmpty()) {
            LOGGER.warn("DELETE rejected - no session ID provided");
            httpResponse.sendError(HttpServletResponse.SC_BAD_REQUEST, "Mcp-Session-Id header required for DELETE");
            return;
        }
        
        McpServerSession session = sessionManager.getSession(sessionId);
        LOGGER.debug("DELETE - Session for id: " + sessionId + " found: " + (session != null));

        if (session == null) {
            // Unknown or already terminated session - the spec requires 404 for such session IDs
            httpResponse.sendError(HttpServletResponse.SC_NOT_FOUND, "Session not found");
            return;
        }

        // Only the session owner may terminate the session
        if (sessionManager.isAuthenticationRequired(mcpServer)) {
            String authenticatedUsername = sessionManager.authenticateAndGetUsername(httpRequest, mcpServer);
            String sessionOwnerUsername = sessionManager.getOwnerForMcpSession(sessionId);
            if (authenticatedUsername == null || !authenticatedUsername.equals(sessionOwnerUsername)) {
                LOGGER.debug("DELETE rejected - authentication failed for session: " + sessionId);
                sendUnauthorized(httpRequest, httpResponse);
                return;
            }
        }

        try {
            LOGGER.debug("Closing session gracefully: " + sessionId);
            session.closeGracefully().block();
            sessionManager.closeSession(sessionId);
            transports.remove(sessionId);

            // 204 No Content must not have a body - just set status
            httpResponse.setStatus(HttpServletResponse.SC_NO_CONTENT);

            LOGGER.debug("Session closed successfully: " + sessionId);
        } catch (Exception e) {
            LOGGER.error("Error closing session: " + sessionId, e);
            httpResponse.sendError(HttpServletResponse.SC_INTERNAL_SERVER_ERROR,
                                  "Error closing session: " + e.getMessage());
        }
    }
    
    /**
     * Gracefully closes the transport handler and all active sessions.
     * Sets closing flag to reject new requests and closes all sessions with timeout.
     */
    public void closeGracefully() throws Exception {
        isClosing.set(true);
        LOGGER.debug("Closing transport handler gracefully, " + transports.size() + " active sessions");
        
        // Close all active sessions with a timeout
        for (String sessionId : transports.keySet()) {
            try {
                LOGGER.debug("Closing session during shutdown: " + sessionId);
                sessionManager.closeSession(sessionId);
            } catch (Exception e) {
                LOGGER.warn("Failed to close session " + sessionId + " during shutdown: " + e.getMessage());
                // Continue closing other sessions
            }
        }
        transports.clear();
        LOGGER.info("Transport handler closed");
    }
    
    /**
     * Supported MCP methods that this server handles.
     * Any request method not in this list will receive an empty success response.
     */
    private static final java.util.Set<String> SUPPORTED_METHODS = java.util.Set.of(
        "initialize",
        "ping",
        "tools/list",
        "tools/call",
        "prompts/list",
        "prompts/get"
    );
    
    /**
     * Check if a method is an unsupported optional method.
     * Unsupported methods get an empty success response so clients can continue.
     */
    private boolean isUnsupportedOptionalMethod(String method) {
        return !SUPPORTED_METHODS.contains(method);
    }
    
    /**
     * Deserialize a JSON-RPC message using the SDK default mapper.
     */
    private McpSchema.JSONRPCMessage deserializeJsonRpcMessage(String json) throws IOException {
        try {
            return McpSchema.deserializeJsonRpcMessage(MAPPER, json);
            
        } catch (Exception e) {
            LOGGER.error("Failed to deserialize JSON-RPC message: " + e.getMessage(), e);
            throw new IOException("Failed to deserialize JSON-RPC message", e);
        }
    }
    
    /**
     * Helper method to read the request body as a string.
     * Uses char buffer to preserve newlines (readLine() strips them).
     * Note: BufferedReader is owned by servlet container and should not be closed here.
     */
    private String readRequestBody(HttpServletRequest request) throws IOException {
        StringBuilder body = new StringBuilder();
        BufferedReader reader = request.getReader();
        char[] buffer = new char[8192];
        int charsRead;
        
        while ((charsRead = reader.read(buffer)) != -1) {
            body.append(buffer, 0, charsRead);
        }
        
        String result = body.toString();
        if (result.isEmpty()) {
            throw new IOException("Request body is empty");
        }
        
        return result;
    }
    
    /**
     * Helper method to send a JSON error response.
     * Only sends the error message, not internal details like stack traces.
     */
    private void sendJsonError(HttpServletResponse response, int statusCode, String message) throws IOException {
        if (!response.isCommitted()) {
            response.setStatus(statusCode);
            setStreamableHttpResponseHeaders(response);
            // Create a simple JSON error response without exposing internal details
            String jsonError = "{\"error\":{\"code\":" + statusCode + ",\"message\":\"" + message + "\"}}";
            response.getOutputStream().write(jsonError.getBytes(UTF_8));
            response.getOutputStream().flush();
            response.flushBuffer(); // Commit the response
        }
    }
    
    /**
     * Rejects a request with 401. If an authorization server is configured, a WWW-Authenticate challenge
     * pointing to the Protected Resource Metadata is added, so that MCP clients can discover where to obtain
     * (or refresh) an access token and retry.
     */
    private void sendUnauthorized(HttpServletRequest request, HttpServletResponse response) throws IOException {
        if (isOAuthEnabled() && !response.isCommitted()) {
            String challenge = "Bearer resource_metadata=\"" + getProtectedResourceMetadataUrl() + "\"";
            // MCP clients prefer the scope from the challenge over scopes_supported in the metadata
            String scopes = getScopes();
            if (scopes != null) {
                challenge += ", scope=\"" + scopes + "\"";
            }
            // RFC 6750: only signal an error code if the client actually sent a token
            String authHeader = request.getHeader("Authorization");
            if (authHeader != null && authHeader.regionMatches(true, 0, "Bearer ", 0, 7)) {
                challenge += ", error=\"invalid_token\"";
            }
            response.setHeader("WWW-Authenticate", challenge);
        }
        sendJsonError(response, HttpServletResponse.SC_UNAUTHORIZED, "Authentication failed");
    }

    private boolean isOAuthEnabled() {
        String authorizationServerUrl = mcpServer.getAuthorizationServerUrl();
        return authorizationServerUrl != null && !authorizationServerUrl.isBlank();
    }

    private String getScopes() {
        String scopes = mcpServer.getScopes();
        return scopes == null || scopes.isBlank() ? null : scopes;
    }

    /**
     * Derives the metadata URL from the endpoint ("<root>/<path>/mcp" becomes
     * "<root>/<path>/.well-known/oauth-protected-resource").
     */
    private String getProtectedResourceMetadataUrl() {
        String endpoint = mcpServer.getEndpoint();
        return endpoint.substring(0, endpoint.length() - "mcp".length()) + PROTECTED_RESOURCE_METADATA_PATH;
    }

    private void setStreamableHttpResponseHeaders(HttpServletResponse response) {
        response.setContentType(APPLICATION_JSON);
        response.setCharacterEncoding(UTF_8);
        response.setHeader("Cache-Control", "no-cache");
    }
    
    /**
     * Rejects a request that requires an existing, already-initialized session (any method
     * other than "initialize") when no Mcp-Session-Id was provided. Returns immediately
     * instead of letting the caller fall through to session.handle()'s 30s timeout.
     */
    private void sendSessionRequiredError(HttpServletResponse response, McpSchema.JSONRPCMessage message) throws IOException {
        sendSessionError(response, message, HttpServletResponse.SC_BAD_REQUEST, -32600,
            "Invalid Request: a valid Mcp-Session-Id header is required");
    }

    /**
     * Rejects a request whose Mcp-Session-Id is unknown or no longer valid. Per the Streamable HTTP
     * spec, HTTP 404 signals the client that it must start a new session by sending a new initialize request.
     */
    private void sendSessionNotFoundError(HttpServletResponse response, McpSchema.JSONRPCMessage message) throws IOException {
        sendSessionError(response, message, HttpServletResponse.SC_NOT_FOUND, -32001, "Session not found");
    }

    private void sendSessionError(HttpServletResponse response, McpSchema.JSONRPCMessage message,
                                  int statusCode, int jsonRpcErrorCode, String errorMessage) throws IOException {
        if (response.isCommitted()) {
            return;
        }
        // Notifications have no id; the spec allows a JSON-RPC error response without id for those
        Object requestId = (message instanceof McpSchema.JSONRPCRequest)
                ? ((McpSchema.JSONRPCRequest) message).id() : null;
        McpSchema.JSONRPCResponse errorResponse = new McpSchema.JSONRPCResponse(
            McpSchema.JSONRPC_VERSION,
            requestId,
            null,
            new McpSchema.JSONRPCResponse.JSONRPCError(jsonRpcErrorCode, errorMessage, null)
        );
        response.setStatus(statusCode);
        setStreamableHttpResponseHeaders(response);
        response.getOutputStream().write(MAPPER.writeValueAsString(errorResponse).getBytes(UTF_8));
        response.getOutputStream().flush();
        response.flushBuffer();
    }
    
    /**
     * Set response headers for SSE (Server-Sent Events) format.
     * VS Code and some other MCP clients expect SSE format for Streamable HTTP transport.
     */
    private void setSSEResponseHeaders(HttpServletResponse response) {
        response.setContentType(TEXT_EVENT_STREAM);
        response.setCharacterEncoding(UTF_8);
        response.setHeader("Cache-Control", "no-cache, no-transform");
        response.setHeader("Connection", "keep-alive");
    }
    
    protected String getSessionId(HttpServletRequest httpServletRequest, McpServer mcpServer) throws CoreException {
        // Authenticate user and get Mendix session ID (if authentication is configured)
        return sessionManager.authenticateAndCreateMendixSession(httpServletRequest, mcpServer);
    }
    
    /**
     * Implementation of McpServerTransport for Streamable HTTP sessions.
     * Uses synchronous HTTP request/response for bidirectional communication.
     * Supports concurrent requests by tracking responses per JSON-RPC request ID.
     * Cleanup is handled by the finally block in handlePost() after each request.
     */
    private class StreamableHttpSessionTransport implements McpServerTransport {
        
        private final String sessionId;
        // Map of JSON-RPC request ID to pending response info
        private final Map<Object, PendingRequest> pendingRequests = new java.util.concurrent.ConcurrentHashMap<>();
        
        /**
         * Holds information about a pending request awaiting a response.
         */
        private static class PendingRequest {
            final HttpServletResponse response;
            volatile boolean messageSent = false;
            
            PendingRequest(HttpServletResponse response) {
                this.response = response;
            }
        }
        
        StreamableHttpSessionTransport(String sessionId, HttpServletResponse response) {
            this.sessionId = sessionId;
            // Initial response is not associated with any request ID yet
        }
        
        /**
         * Register a pending request with its response object.
         * @param requestId The JSON-RPC request ID
         * @param response The HTTP response object for this request
         */
        public void registerRequest(Object requestId, HttpServletResponse response) {
            if (requestId != null) {
                pendingRequests.put(requestId, new PendingRequest(response));
                LOGGER.debug("Registered pending request: " + requestId + " for session: " + sessionId);
            }
        }
        
        /**
         * Unregister a completed request.
         * @param requestId The JSON-RPC request ID
         */
        public void unregisterRequest(Object requestId) {
            if (requestId != null) {
                pendingRequests.remove(requestId);
                LOGGER.debug("Unregistered request: " + requestId + " for session: " + sessionId);
            }
        }
        
        /**
         * Check if a message was sent for a specific request.
         * @param requestId The JSON-RPC request ID
         */
        public boolean wasMessageSent(Object requestId) {
            PendingRequest pending = pendingRequests.get(requestId);
            return pending != null && pending.messageSent;
        }
        
        @Override
        public Mono<Void> sendMessage(McpSchema.JSONRPCMessage message) {
            return Mono.fromRunnable(() -> {
                // Drop notifications - Streamable HTTP clients cannot receive server-initiated notifications
                if (message instanceof McpSchema.JSONRPCNotification) {
                    LOGGER.debug("Dropping notification for session: " + sessionId + 
                               " - method: " + ((McpSchema.JSONRPCNotification) message).method());
                    return;
                }
                
                // Extract the request ID from the response to find the correct pending request
                Object requestId = null;
                if (message instanceof McpSchema.JSONRPCResponse) {
                    requestId = ((McpSchema.JSONRPCResponse) message).id();
                }
                
                if (requestId == null) {
                    LOGGER.warn("Cannot send message without request ID for session: " + sessionId);
                    return;
                }
                
                PendingRequest pending = pendingRequests.get(requestId);
                if (pending == null) {
                    LOGGER.warn("No pending request found for ID: " + requestId + " in session: " + sessionId);
                    return;
                }
                
                synchronized (pending) {
                    // If already sent for this request, skip (idempotent)
                    if (pending.messageSent) {
                        LOGGER.debug("Message already sent for request: " + requestId + ", skipping duplicate");
                        return;
                    }
                    
                    String messageType = message.getClass().getSimpleName();
                    LOGGER.debug("Sending response for request: " + requestId + ", session: " + sessionId + ", type: " + messageType);
                    sendMessageNow(message, pending.response);
                    pending.messageSent = true;
                    LOGGER.debug("Response sent successfully for request: " + requestId);
                }
            });
        }
        
        private void sendMessageNow(McpSchema.JSONRPCMessage message, HttpServletResponse targetResponse) {
            if (targetResponse == null) {
                LOGGER.warn("Cannot send message, response is null for session: " + sessionId);
                return;
            }
            
            try {
                if (targetResponse.isCommitted()) {
                    LOGGER.warn("Cannot send message, response already committed for session: " + sessionId);
                    return;
                }
                
                targetResponse.setStatus(HttpServletResponse.SC_OK);
                // Use SSE format for VS Code and other clients that expect text/event-stream
                setSSEResponseHeaders(targetResponse);
                
                String jsonText = MAPPER.writeValueAsString(message);
                // SSE format: each event is prefixed with "data: " and terminated with double newline
                String sseEvent = "data: " + jsonText + "\n\n";
                targetResponse.getOutputStream().write(sseEvent.getBytes(UTF_8));
                targetResponse.getOutputStream().flush();
                targetResponse.flushBuffer();
                
                LOGGER.debug("Message sent (SSE format) for session: " + sessionId);
                
            } catch (Exception e) {
                LOGGER.error("Failed to send message for session " + sessionId + ": " + e.getMessage(), e);
            }
        }
        
        @Override
        public <T> T unmarshalFrom(Object data, TypeRef<T> typeRef) {
            return MAPPER.convertValue(data, typeRef);
        }
        
        @Override
        public Mono<Void> closeGracefully() {
            return Mono.fromRunnable(() -> {
                LOGGER.debug("Gracefully closing transport for session: " + sessionId);
                transports.remove(sessionId);
                sessionManager.closeSession(sessionId);
            });
        }
        
        @Override
        public void close() {
            LOGGER.debug("Closing transport for session: " + sessionId);
            transports.remove(sessionId);
            sessionManager.closeSession(sessionId);
        }
    }
}
