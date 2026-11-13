package servicedesk.graph;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;

/**
 * The AI's product tools, over the order-free catalog dataset: whatever the
 * model asks, nothing reachable from here can reveal a customer's order. Order
 * contents reach the AI only through GetOrderProducts, which checks the user.
 */
public final class ProductTools {
	static final String PREFIXES = "PREFIX shop: <https://example.org/bikeshop#> PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#> PREFIX xsd: <http://www.w3.org/2001/XMLSchema#> ";
	private static final String DATASET = "catalog";
	private static final int MAX_ROWS = 50;
	private static final Pattern WRITE = Pattern.compile("(?i)\\b(INSERT|DELETE|LOAD|CLEAR|DROP|CREATE|ADD|MOVE|COPY|WITH|SERVICE)\\b");
	private static final Pattern PREFIX = Pattern.compile("(?im)^\\s*PREFIX\\s+\\S+\\s*<[^>]*>\\s*");

	private ProductTools() {
	}

	public static String run(String tool, String argument) throws Exception {
		String arg = argument == null ? "" : argument;
		switch (tool) {
			case "find_product": return findProduct(arg);
			case "compatible_parts": return compatibleParts(arg);
			case "known_issues": return knownIssues(arg);
			case "product_outline": return productOutline(arg);
			case "sparql_query": return sparqlQuery(arg);
			default: throw new IllegalArgumentException("Unknown product tool " + tool);
		}
	}

	private static List<Map<String, String>> select(String query) throws Exception {
		return SparqlGraph.query(DATASET, PREFIXES + query).values;
	}

	private static String sku(String text) {
		return text.replaceAll("[^A-Za-z0-9-]", "").toUpperCase();
	}

	private static String eur(String v) {
		return String.format(java.util.Locale.ROOT, "%.2f", Double.parseDouble(v));
	}

	private static String local(String iri) {
		int i = iri.lastIndexOf('#');
		return i < 0 ? iri : iri.substring(i + 1);
	}

	static String findProduct(String search) throws Exception {
		String text = search.replace("\"", "").replace("\\", "").trim();
		List<Map<String, String>> rows = select("SELECT ?sku ?name ?type ?price ?warranty ?supplier (GROUP_CONCAT(DISTINCT ?csku; separator=\", \") AS ?components) WHERE { "
			+ "?p shop:sku ?sku ; rdfs:label ?name ; a ?t ; shop:price ?price ; shop:warrantyYears ?warranty ; shop:suppliedBy ?s . "
			+ "?t rdfs:label ?type . ?s rdfs:label ?supplier . OPTIONAL { ?p shop:hasComponent ?c . ?c shop:sku ?csku } "
			+ "FILTER(CONTAINS(LCASE(?sku), LCASE(\"" + text + "\")) || CONTAINS(LCASE(?name), LCASE(\"" + text + "\"))) "
			+ "} GROUP BY ?sku ?name ?type ?price ?warranty ?supplier ORDER BY ?sku LIMIT 20");
		if (rows.isEmpty()) {
			return "No product matches '" + search + "'.";
		}
		List<String> out = new ArrayList<>();
		for (Map<String, String> r : rows) {
			String comps = r.get("components");
			out.add(r.get("sku") + ": " + r.get("name") + " (" + r.get("type") + "), EUR " + eur(r.get("price")) + ", warranty " + r.get("warranty")
				+ " years, supplier " + r.get("supplier") + (comps == null || comps.isEmpty() ? "" : ", ships with " + comps));
		}
		return String.join("\n", out);
	}

	static String compatibleParts(String input) throws Exception {
		String s = sku(input);
		List<Map<String, String>> fitsIt = select("SELECT ?sku ?name ?price WHERE { ?b shop:sku \"" + s + "\" . ?p shop:compatibleWith ?b ; shop:sku ?sku ; rdfs:label ?name ; shop:price ?price } ORDER BY ?sku");
		List<Map<String, String>> itFits = select("SELECT ?sku ?name WHERE { ?p shop:sku \"" + s + "\" ; shop:compatibleWith ?t . ?t shop:sku ?sku ; rdfs:label ?name } ORDER BY ?sku");
		if (fitsIt.isEmpty() && itFits.isEmpty()) {
			return "No compatibility data for " + s + ". Check the SKU with find_product.";
		}
		List<String> lines = new ArrayList<>();
		if (!fitsIt.isEmpty()) {
			List<String> parts = new ArrayList<>();
			for (Map<String, String> r : fitsIt) {
				parts.add(r.get("sku") + " " + r.get("name") + " (EUR " + eur(r.get("price")) + ")");
			}
			lines.add("Fits " + s + ": " + String.join("; ", parts));
		}
		if (!itFits.isEmpty()) {
			List<String> parts = new ArrayList<>();
			for (Map<String, String> r : itFits) {
				parts.add(r.get("sku") + " " + r.get("name"));
			}
			lines.add(s + " fits on / works with: " + String.join("; ", parts));
		}
		return String.join("\n", lines);
	}

	static String knownIssues(String input) throws Exception {
		String s = sku(input);
		List<Map<String, String>> rows = select("SELECT ?id ?label ?batch ?advice ?via WHERE { ?p shop:sku \"" + s + "\" . "
			+ "{ ?i shop:affects ?p . BIND(\"\" AS ?via) } UNION { ?p shop:hasComponent ?c . ?i shop:affects ?c . ?c shop:sku ?via } "
			+ "?i shop:issueId ?id ; rdfs:label ?label ; shop:advice ?advice . OPTIONAL { ?i shop:affectsBatch ?batch } }");
		if (rows.isEmpty()) {
			return "No known issues or recalls for " + s + ".";
		}
		List<String> out = new ArrayList<>();
		for (Map<String, String> r : rows) {
			String batch = r.get("batch");
			String via = r.getOrDefault("via", "");
			out.add((batch != null ? "RECALL " : "Known issue ") + r.get("id") + (via.isEmpty() ? "" : " (via component " + via + ")") + ": "
				+ r.get("label") + "." + (batch != null ? " Affects batch " + batch + " only." : "") + " Advice: " + r.get("advice"));
		}
		return String.join("\n", out);
	}

	private static String nodes(String query) throws Exception {
		List<String> out = new ArrayList<>();
		for (Map<String, String> r : select(query)) {
			out.add("{\"label\":" + SparqlGraph.json(r.get("sku") + " " + r.get("name")) + ",\"ref\":" + SparqlGraph.json(r.get("sku")) + "}");
		}
		return String.join(",", out);
	}

	static String productOutline(String input) throws Exception {
		String code = sku(input);
		List<Map<String, String>> base = select("SELECT ?p ?name ?type ?price ?warranty ?s ?supplier WHERE { ?p shop:sku \"" + code + "\" ; rdfs:label ?name ; a ?t ; "
			+ "shop:price ?price ; shop:warrantyYears ?warranty ; shop:suppliedBy ?s . ?t rdfs:label ?type . ?s rdfs:label ?supplier } LIMIT 1");
		if (base.isEmpty()) {
			return "No product with SKU " + code + ".";
		}
		Map<String, String> b = base.get(0);
		String p = "<" + b.get("p") + ">";
		String components = nodes("SELECT ?sku ?name WHERE { " + p + " shop:hasComponent ?c . ?c shop:sku ?sku ; rdfs:label ?name } ORDER BY ?sku");
		String fits = nodes("SELECT DISTINCT ?sku ?name WHERE { ?c shop:compatibleWith " + p + " . ?c shop:sku ?sku ; rdfs:label ?name } ORDER BY ?sku");
		String fitsOn = nodes("SELECT DISTINCT ?sku ?name WHERE { " + p + " shop:compatibleWith ?c . ?c shop:sku ?sku ; rdfs:label ?name } ORDER BY ?sku");
		String usedIn = nodes("SELECT DISTINCT ?sku ?name WHERE { ?c shop:hasComponent " + p + " . ?c shop:sku ?sku ; rdfs:label ?name } ORDER BY ?sku");
		List<String> issues = new ArrayList<>();
		for (Map<String, String> r : select("SELECT DISTINCT ?id ?name (EXISTS { ?i a shop:Recall } AS ?recall) WHERE { "
			+ "{ ?i shop:affects " + p + " } UNION { " + p + " shop:hasComponent ?c . ?i shop:affects ?c } ?i shop:issueId ?id ; rdfs:label ?name } ORDER BY ?id")) {
			issues.add("{\"label\":" + SparqlGraph.json(r.get("id") + ": " + r.get("name")) + ",\"ref\":" + SparqlGraph.json(r.get("id"))
				+ ",\"value\":" + SparqlGraph.json("true".equals(r.get("recall")) ? "recall" : "known issue") + "}");
		}
		List<String> outline = new ArrayList<>();
		String[][] groups = {
			{ "Ships with", components }, { "Compatible parts and accessories", fits }, { "Fits on / works with", fitsOn }, { "Part of", usedIn },
			{ "Known issues and recalls", issues.isEmpty() ? "{\"label\":\"None known\"}" : String.join(",", issues) } };
		for (String[] g : groups) {
			if (!g[1].isEmpty()) {
				outline.add("{\"label\":" + SparqlGraph.json(g[0]) + ",\"children\":[" + g[1] + "]}");
			}
		}
		return "{\"type\":\"product\",\"title\":" + SparqlGraph.json(code + " · " + b.get("name")) + ",\"subtitle\":" + SparqlGraph.json(b.get("type"))
			+ ",\"tone\":" + (issues.isEmpty() ? "\"neutral\"" : "\"warning\"")
			+ ",\"fields\":[{\"label\":\"Price\",\"value\":" + SparqlGraph.json("EUR " + eur(b.get("price"))) + "},"
			+ "{\"label\":\"Warranty\",\"value\":" + SparqlGraph.json(b.get("warranty") + " years") + "},"
			+ "{\"label\":\"Supplier\",\"value\":" + SparqlGraph.json(b.get("supplier")) + ",\"ref\":" + SparqlGraph.json(local(b.get("s"))) + "}],"
			+ "\"outline\":[" + String.join(",", outline) + "]}";
	}

	static String sparqlQuery(String query) {
		String body = PREFIX.matcher(query).replaceAll("").trim();
		if (!body.matches("(?is)^(SELECT|ASK)\\b.*") || WRITE.matcher(body).find()) {
			return "Refused: only read-only SELECT or ASK queries are allowed.";
		}
		if (body.toUpperCase().startsWith("SELECT") && !body.matches("(?is).*\\bLIMIT\\s+\\d+.*")) {
			body += " LIMIT " + MAX_ROWS;
		}
		SparqlGraph.Rows r;
		try {
			r = SparqlGraph.query(DATASET, PREFIXES + body);
		} catch (Exception e) {
			return "Query failed: " + e.getMessage();
		}
		if (r.ask != null) {
			return String.valueOf(r.ask);
		}
		if (r.values.isEmpty()) {
			return "No results.";
		}
		List<String> lines = new ArrayList<>();
		lines.add(String.join(" | ", r.vars));
		for (int i = 0; i < Math.min(MAX_ROWS, r.values.size()); i++) {
			List<String> cells = new ArrayList<>();
			for (String v : r.vars) {
				cells.add(r.values.get(i).getOrDefault(v, ""));
			}
			lines.add(String.join(" | ", cells));
		}
		return String.join("\n", lines);
	}
}
