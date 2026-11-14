package servicedesk.graph;

import com.mendix.core.Core;
import com.mendix.systemwideinterfaces.core.IContext;
import com.mendix.systemwideinterfaces.core.IMendixObject;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Data quality checks on the catalog (Catalog quality page, 27-catalog-workspace.mdl).
 * Most rules are SPARQL over the catalog dataset, so they check the catalog as
 * the chat and the 3D viewer see it. The wiki rule reads the pages directly.
 */
public final class CatalogQuality {
	private CatalogQuality() {
	}

	private static final String BIKE = "?b shop:mountPoint ?anyMount . ?b shop:sku ?bike . ";

	/** {severity, rule, query returning ?sku ?name ?msg} */
	private static final String[][] RULES = {
		{ "Error", "No 3D model", "SELECT DISTINCT ?sku ?name (CONCAT(\"On or for bike \", ?bike, \", but it has no 3D model, so the viewer lists it instead of drawing it.\") AS ?msg) WHERE { "
			+ BIKE + "{ ?b shop:hasComponent ?p } UNION { ?b shop:hasStandardPart ?p } UNION { ?p shop:compatibleWith ?b } "
			+ "?p shop:sku ?sku ; rdfs:label ?name . FILTER NOT EXISTS { ?p shop:mountsAt ?m } } ORDER BY ?sku" },
		{ "Error", "Fit size conflict", "SELECT DISTINCT ?sku ?name (CONCAT(\"Marked as fitting \", ?bike, \", but it needs \", STR(?pf), \" mm and the bike's seat tube is \", STR(?bf), \" mm.\") AS ?msg) WHERE { "
			+ BIKE + "?p shop:compatibleWith ?b ; shop:fitDiameterMm ?pf ; shop:sku ?sku ; rdfs:label ?name . ?b shop:seatTubeFitMm ?bf . FILTER(?pf != ?bf) } ORDER BY ?sku" },
		{ "Error", "No mount point", "SELECT DISTINCT ?sku ?name (CONCAT(\"Marked as fitting \", ?bike, \", but it mounts at \", ?code, \" and that bike has no such mount point.\") AS ?msg) WHERE { "
			+ BIKE + "{ ?p shop:compatibleWith ?b } UNION { ?b shop:hasComponent ?p } UNION { ?b shop:hasStandardPart ?p } "
			+ "?p shop:mountsAt ?code ; shop:sku ?sku ; rdfs:label ?name . FILTER NOT EXISTS { ?b shop:mountCode ?code } } ORDER BY ?sku" },
		{ "Warning", "No supplier", "SELECT ?sku ?name (\"Nobody supplies it: set the supplier on the Details tab.\" AS ?msg) WHERE { "
			+ "?p shop:sku ?sku ; rdfs:label ?name . FILTER NOT EXISTS { ?p shop:suppliedBy ?s } } ORDER BY ?sku" },
		{ "Warning", "No price", "SELECT ?sku ?name (\"It has no price.\" AS ?msg) WHERE { "
			+ "?p shop:sku ?sku ; rdfs:label ?name . FILTER NOT EXISTS { ?p shop:price ?price } } ORDER BY ?sku" },
		{ "Warning", "Recall without batch", "SELECT ?sku ?name (CONCAT(\"Recall \", ?id, \" names no production batch, so every unit counts as affected.\") AS ?msg) WHERE { "
			+ "?i a shop:Recall ; shop:issueId ?id ; shop:affects ?p . ?p shop:sku ?sku ; rdfs:label ?name . FILTER NOT EXISTS { ?i shop:affectsBatch ?batch } } ORDER BY ?sku" },
	};

	private static final Pattern SKU_LIKE = Pattern.compile("\\b([A-Z]{2,4})-([A-Z0-9]{2,8})\\b");

	public static List<IMendixObject> check(IContext ctx) throws Exception {
		List<IMendixObject> out = new ArrayList<>();
		for (String[] rule : RULES) {
			for (Map<String, String> r : SparqlGraph.query("catalog", ProductTools.PREFIXES + rule[2]).values) {
				out.add(issue(ctx, rule[0], rule[1], r.get("sku"), r.get("name"), r.get("msg")));
			}
		}
		// a wiki page that names an SKU the catalog does not have (an SKU-like word with a prefix the catalog uses)
		Set<String> skus = new HashSet<>();
		Set<String> prefixes = new HashSet<>();
		for (Map<String, String> r : SparqlGraph.query("catalog", ProductTools.PREFIXES + "SELECT ?sku WHERE { ?p shop:sku ?sku }").values) {
			skus.add(r.get("sku"));
			prefixes.add(r.get("sku").split("-")[0]);
		}
		for (IMendixObject page : Core.createXPathQuery("//ServiceDesk.WikiPage").execute(ctx)) {
			String body = page.getValue(ctx, "Body") instanceof String ? (String) page.getValue(ctx, "Body") : "";
			Set<String> unknown = new TreeSet<>();
			Matcher m = SKU_LIKE.matcher(body);
			while (m.find()) {
				if (prefixes.contains(m.group(1)) && !skus.contains(m.group())) {
					unknown.add(m.group());
				}
			}
			for (String sku : unknown) {
				out.add(issue(ctx, "Warning", "Unknown SKU in the wiki", sku, "",
					"The wiki page \"" + page.getValue(ctx, "Title") + "\" (" + page.getValue(ctx, "Slug") + ") names " + sku + ", which is not in the catalog."));
			}
		}
		return out;
	}

	private static IMendixObject issue(IContext ctx, String severity, String rule, String sku, String name, String msg) {
		IMendixObject o = Core.instantiate(ctx, "ServiceDesk.CatalogIssue");
		o.setValue(ctx, "Severity", severity);
		o.setValue(ctx, "Rule", rule);
		o.setValue(ctx, "Sku", sku);
		o.setValue(ctx, "Name", name);
		o.setValue(ctx, "Message", msg);
		return o;
	}
}
