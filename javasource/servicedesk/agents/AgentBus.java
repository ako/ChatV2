package servicedesk.agents;

import java.util.List;
import java.util.UUID;

import com.mendix.core.Core;
import com.mendix.systemwideinterfaces.core.IContext;
import com.mendix.systemwideinterfaces.core.IMendixObject;

/**
 * Asks another agent over the agent bus (Business Events on Kafka) and waits for its answer.
 *
 * The task is sent in a transaction of its own: a business event is published from the
 * module's outbox only after the publishing transaction commits, and the caller (an agent's
 * tool call) is still inside the chat's transaction. Waiting there would wait for itself.
 * The answer arrives on the bus too: the bus's handler sets the task's Answer and Status,
 * which this method polls for.
 */
public final class AgentBus {
	private AgentBus() {}

	/** Fails fast when the broker in BusinessEvents.ServerUrl does not accept a connection: a task published then would only wait out its timeout. */
	private static void requireBroker() throws Exception {
		Object url = Core.getConfiguration().getConstantValue("BusinessEvents.ServerUrl");
		String first = url == null ? "" : url.toString().split(",")[0].trim();
		int colon = first.lastIndexOf(':');
		if (first.isEmpty() || colon < 1) throw new IllegalStateException("BusinessEvents.ServerUrl is not set");
		try (java.net.Socket socket = new java.net.Socket()) {
			socket.connect(new java.net.InetSocketAddress(first.substring(0, colon), Integer.parseInt(first.substring(colon + 1))), 1000);
		} catch (java.io.IOException e) {
			throw new IllegalStateException("the agent bus broker at " + first + " is not reachable", e);
		}
	}

	public static String ask(String fromAgent, String toAgent, String question, String contextId, long timeoutSeconds) throws Exception {
		requireBroker();
		String taskId = UUID.randomUUID().toString();
		String ctxId = (contextId == null || contextId.isBlank()) ? taskId : contextId;

		IContext send = Core.createSystemContext();
		send.startTransaction();
		try {
			Core.microflowCall("ServiceDesk.SUB_AgentBus_SendTask")
				.withParam("TaskId", taskId)
				.withParam("ContextId", ctxId)
				.withParam("FromAgent", fromAgent)
				.withParam("ToAgent", toAgent)
				.withParam("Question", question)
				.execute(send);
			send.endTransaction();
		} catch (Exception e) {
			send.rollbackTransaction();
			throw e;
		}

		long deadline = System.currentTimeMillis() + Math.max(5, timeoutSeconds) * 1000L;
		while (System.currentTimeMillis() < deadline) {
			Thread.sleep(600);
			IContext read = Core.createSystemContext();
			// taskId is a UUID made above, so it is safe in the query as a literal
			List<IMendixObject> rows = Core.createXPathQuery("//ServiceDesk.AgentTask[TaskId='" + taskId + "']")
				.execute(read);
			if (rows.isEmpty()) continue;
			IMendixObject task = rows.get(0);
			// getValue is generic: read into an Object first, or String.valueOf picks its char[] overload
			Object statusValue = task.getValue(read, "Status");
			String status = String.valueOf(statusValue);
			if ("Completed".equals(status) || "Failed".equals(status)) {
				Object answer = task.getValue(read, "Answer");
				return answer == null ? "" : answer.toString();
			}
		}
		IContext mark = Core.createSystemContext();
		Core.microflowCall("ServiceDesk.SUB_AgentBus_TimedOut").withParam("TaskId", taskId).execute(mark);
		return toAgent + " did not answer within " + timeoutSeconds + " seconds.";
	}
}
