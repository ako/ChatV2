package servicedesk.graph;

import com.mendix.core.Core;
import com.mendix.logging.ILogNode;

import java.io.File;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.ResultSetMetaData;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;

/**
 * SPARQL over the app's own database, inside the Mendix runtime.
 *
 * An in-process DuckDB (the duckdb_jdbc dependency) attaches the app database
 * read-only with the runtime's own database settings, creates the views in
 * resources/sparql/views.sql, and translates each SPARQL query into SQL with
 * the rdf extension and an R2RML mapping (resources/sparql/mappings). Nothing
 * is copied: every query reads the current data.
 *
 * Datasets, each a set of mappings:
 *   catalog   products, suppliers, known issues and the wiki (what the AI's product tools reach)
 *   products  the catalog plus orders and their lines (the app's own queries, after checking the user)
 *   app       all of that plus customers and tickets
 *
 * Extensions: loaded from resources/sparql/extensions when bundled there
 * (tools/product-catalog/bundle-extensions.sh, for offline servers), otherwise
 * installed once from DuckDB's repositories into the runtime's temp folder.
 */
public final class SparqlGraph {
	private static final ILogNode LOG = Core.getLogger("ServiceDesk");
	private static final Map<String, String[]> DATASETS = Map.of(
		"catalog", new String[] { "catalog" },
		"products", new String[] { "catalog", "orders" },
		"app", new String[] { "catalog", "orders", "app" });
	private static final Pattern IRI = Pattern.compile("^(https?|urn):\\S+$");
	private static final Pattern ASK = Pattern.compile("(?is)^(\\s*(PREFIX\\s+\\S+\\s*<[^>]*>|BASE\\s+<[^>]*>|#[^\\n]*)\\s*)*ASK\\b.*");

	private static Connection connection;
	private static final Map<String, String> mappings = new LinkedHashMap<>();

	private SparqlGraph() {
	}

	/** One result row: variable name to value, unbound variables left out; kinds hold "uri", "literal" or "bnode". */
	public static final class Rows {
		public final List<String> vars = new ArrayList<>();
		public final List<Map<String, String>> values = new ArrayList<>();
		public final List<Map<String, String>> kinds = new ArrayList<>();
		public Boolean ask;
	}

	/** Runs a SPARQL SELECT or ASK on a dataset. */
	public static Rows query(String dataset, String sparql) throws SQLException, IOException {
		if (!DATASETS.containsKey(dataset)) {
			throw new IllegalArgumentException("Unknown dataset " + dataset + ": use catalog, products or app.");
		}
		try {
			return run(dataset, sparql);
		} catch (SQLException e) {
			if (!isConnectionError(e)) {
				throw e;
			}
			LOG.info("SPARQL: the database connection was lost; attaching it again.");
			reset();
			return run(dataset, sparql);
		}
	}

	/** Runs a query and returns the SPARQL 1.1 JSON results document. */
	public static String queryJson(String dataset, String sparql) throws SQLException, IOException {
		return toJson(query(dataset, sparql));
	}

	private static Rows run(String dataset, String sparql) throws SQLException, IOException {
		Connection c = connection();
		Rows out = new Rows();
		try (PreparedStatement ps = c.prepareStatement("SELECT * FROM execute_sparql(?, ?)")) {
			ps.setString(1, sparql);
			ps.setString(2, mappings.get(dataset));
			try (ResultSet rs = ps.executeQuery()) {
				ResultSetMetaData md = rs.getMetaData();
				int n = md.getColumnCount();
				List<String> cols = new ArrayList<>();
				for (int i = 1; i <= n; i++) {
					cols.add(md.getColumnName(i));
				}
				if (ASK.matcher(sparql).matches()) {
					out.ask = rs.next() && rs.getBoolean(1);
					return out;
				}
				// execute_sparql names a variable's column v_<var>, and adds d_<var> with its
				// term kind ('I' for an IRI) where the mapping alone does not decide it
				for (String col : cols) {
					if (col.startsWith("v_")) {
						out.vars.add(col.substring(2));
					}
				}
				while (rs.next()) {
					Map<String, String> row = new LinkedHashMap<>();
					Map<String, String> kind = new LinkedHashMap<>();
					for (String var : out.vars) {
						Object v = rs.getObject("v_" + var);
						if (v == null) {
							continue;
						}
						String text = v instanceof Boolean ? v.toString().toLowerCase() : v.toString();
						String d = cols.contains("d_" + var) ? rs.getString("d_" + var) : null;
						row.put(var, text);
						if ("I".equals(d) || (d == null && IRI.matcher(text).matches())) {
							kind.put(var, "uri");
						} else if ("B".equals(d)) {
							kind.put(var, "bnode");
						} else {
							kind.put(var, "literal");
						}
					}
					out.values.add(row);
					out.kinds.add(kind);
				}
			}
		}
		return out;
	}

	private static synchronized Connection connection() throws SQLException, IOException {
		if (connection != null && !connection.isClosed()) {
			return connection;
		}
		File res = new File(Core.getConfiguration().getResourcesPath(), "sparql");
		try {
			Class.forName("org.duckdb.DuckDBDriver");
		} catch (ClassNotFoundException e) {
			throw new SQLException("The DuckDB JDBC driver is not on the classpath (dependency org.duckdb:duckdb_jdbc).", e);
		}
		Connection c = DriverManager.getConnection("jdbc:duckdb:");
		try (Statement s = c.createStatement()) {
			String version = scalar(s, "SELECT library_version FROM pragma_version()");
			String platform = scalar(s, "PRAGMA platform");
			// bundled extensions (tools/product-catalog/bundle-extensions.sh) are an installed
			// extension folder: DuckDB loads them as installed, with their signatures checked
			File bundled = new File(res, "extensions");
			boolean isBundled = new File(bundled, version + "/" + platform + "/rdf.duckdb_extension").isFile()
				&& new File(bundled, version + "/" + platform + "/postgres_scanner.duckdb_extension").isFile();
			File extDir = isBundled ? bundled : new File(Core.getConfiguration().getTempPath(), "duckdb-extensions");
			extDir.mkdirs();
			s.execute("SET extension_directory = " + literal(extDir.getAbsolutePath()));
			if (!isBundled) {
				s.execute("INSTALL rdf FROM community");
				s.execute("INSTALL postgres");
			}
			s.execute("LOAD rdf");
			s.execute("LOAD postgres");
			LOG.info("SPARQL: loaded the rdf and postgres extensions " + (isBundled ? "bundled with the app" : "from DuckDB's repositories")
				+ " (" + version + ", " + platform + ").");
			s.execute("ATTACH " + literal(dsn()) + " AS app (TYPE postgres, READ_ONLY)");
			String views = Files.readString(new File(res, "views.sql").toPath(), StandardCharsets.UTF_8)
				.replace("{VOCAB_DIR}", res.getAbsolutePath().replace('\\', '/'));
			for (String stmt : views.split(";\\s*\\n")) {
				if (!stmt.replaceAll("(?m)^\\s*--.*$", "").isBlank()) {
					s.execute(stmt);
				}
			}
		} catch (SQLException | IOException e) {
			c.close();
			throw e;
		}
		buildMappings(res);
		connection = c;
		LOG.info("SPARQL: DuckDB attached the app database read-only; datasets " + DATASETS.keySet() + ".");
		return c;
	}

	private static synchronized void reset() {
		try {
			if (connection != null) {
				connection.close();
			}
		} catch (SQLException ignored) {
			// already gone
		}
		connection = null;
	}

	/** One mapping file per dataset: the rdf extension takes a single file, and Turtle concatenates. */
	private static void buildMappings(File res) throws IOException {
		File dir = new File(Core.getConfiguration().getTempPath(), "sparql-mappings");
		dir.mkdirs();
		for (Map.Entry<String, String[]> ds : DATASETS.entrySet()) {
			StringBuilder sb = new StringBuilder();
			for (String part : ds.getValue()) {
				sb.append(Files.readString(new File(res, "mappings/" + part + ".r2rml.ttl").toPath(), StandardCharsets.UTF_8)).append('\n');
			}
			File f = new File(dir, ds.getKey() + ".r2rml.ttl");
			Files.writeString(f.toPath(), sb.toString(), StandardCharsets.UTF_8);
			mappings.put(ds.getKey(), f.getAbsolutePath());
		}
	}

	/** The runtime's own database settings, as a libpq connection string. */
	private static String dsn() {
		String host = setting("DatabaseHost", "localhost");
		String port = "5432";
		int colon = host.lastIndexOf(':');
		if (colon > 0 && host.indexOf(']') < colon) {
			port = host.substring(colon + 1);
			host = host.substring(0, colon);
		}
		return "host=" + quote(host) + " port=" + quote(port) + " dbname=" + quote(setting("DatabaseName", ""))
			+ " user=" + quote(setting("DatabaseUserName", "")) + " password=" + quote(setting("DatabasePassword", ""));
	}

	private static String setting(String name, String fallback) {
		return Core.getConfiguration().getDatabaseSettingAsString(name).orElse(fallback);
	}

	private static String quote(String v) {
		return "'" + v.replace("\\", "\\\\").replace("'", "\\'") + "'";
	}

	private static String literal(String v) {
		return "'" + v.replace("'", "''") + "'";
	}

	private static String scalar(Statement s, String sql) throws SQLException {
		try (ResultSet rs = s.executeQuery(sql)) {
			rs.next();
			return rs.getString(1);
		}
	}

	private static boolean isConnectionError(SQLException e) {
		String m = String.valueOf(e.getMessage()).toLowerCase();
		// a lost or restarted app database, not a query or setup error
		return m.contains("connection") && !m.contains("extension") || m.contains("server closed") || m.contains("terminating");
	}

	/** The SPARQL 1.1 query results JSON format. */
	public static String toJson(Rows r) {
		if (r.ask != null) {
			return "{\"head\":{},\"boolean\":" + r.ask + "}";
		}
		StringBuilder sb = new StringBuilder("{\"head\":{\"vars\":[");
		for (int i = 0; i < r.vars.size(); i++) {
			sb.append(i > 0 ? "," : "").append(json(r.vars.get(i)));
		}
		sb.append("]},\"results\":{\"bindings\":[");
		for (int i = 0; i < r.values.size(); i++) {
			sb.append(i > 0 ? "," : "").append('{');
			boolean first = true;
			for (Map.Entry<String, String> e : r.values.get(i).entrySet()) {
				sb.append(first ? "" : ",").append(json(e.getKey())).append(":{\"type\":")
					.append(json(r.kinds.get(i).get(e.getKey()))).append(",\"value\":").append(json(e.getValue())).append('}');
				first = false;
			}
			sb.append('}');
		}
		return sb.append("]}}").toString();
	}

	/** A JSON string literal. */
	public static String json(String s) {
		StringBuilder sb = new StringBuilder("\"");
		for (char ch : s.toCharArray()) {
			switch (ch) {
				case '"': sb.append("\\\""); break;
				case '\\': sb.append("\\\\"); break;
				case '\n': sb.append("\\n"); break;
				case '\r': sb.append("\\r"); break;
				case '\t': sb.append("\\t"); break;
				default:
					if (ch < 0x20) {
						sb.append(String.format("\\u%04x", (int) ch));
					} else {
						sb.append(ch);
					}
			}
		}
		return sb.append('"').toString();
	}
}
