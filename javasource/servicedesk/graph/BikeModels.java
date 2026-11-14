package servicedesk.graph;

import com.mendix.core.Core;
import com.mendix.systemwideinterfaces.core.IContext;
import com.mendix.systemwideinterfaces.core.IMendixIdentifier;
import com.mendix.systemwideinterfaces.core.IMendixObject;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/**
 * A bike as the 3D viewer draws it, as JSON, from the app's BOM data
 * (mdlsource/26-bike-bom.mdl): its mount slots, and the parts that can appear on
 * it - its BOM lines (fitted: role "component"; standard: "base") and the parts
 * and accessories compatible with it ("fits") - each with its part model and
 * shapes. Read with the caller's context, so entity access applies. Catalog data
 * only: nothing here is about orders or customers.
 */
public final class BikeModels {
	private BikeModels() {
	}

	/** The bike's model as JSON, or null when there is no product with this SKU or it has no mount slots. */
	public static String json(IContext ctx, String sku) throws Exception {
		List<IMendixObject> found = Core.createXPathQuery("//ServiceDesk.Product[Sku = $sku]").setVariable("sku", sku).execute(ctx);
		if (found.isEmpty()) {
			return null;
		}
		IMendixObject bike = found.get(0);
		String bikeSku = str(ctx, bike, "Sku");
		List<IMendixObject> slots = Core.createXPathQuery("//ServiceDesk.MountSlot[ServiceDesk.MountSlot_Product/ServiceDesk.Product/Sku = $sku]")
			.setVariable("sku", bikeSku).addSort("Code", true).execute(ctx);
		if (slots.isEmpty()) {
			return null;
		}
		StringBuilder sb = new StringBuilder("{\"ref\":").append(SparqlGraph.json(bikeSku))
			.append(",\"label\":").append(SparqlGraph.json(str(ctx, bike, "Name"))).append(",\"slots\":[");
		for (int i = 0; i < slots.size(); i++) {
			IMendixObject s = slots.get(i);
			sb.append(i > 0 ? "," : "").append("{\"code\":").append(SparqlGraph.json(str(ctx, s, "Code")))
				.append(",\"name\":").append(SparqlGraph.json(str(ctx, s, "Name")))
				.append(",\"pos\":[").append(num(ctx, s, "X")).append(',').append(num(ctx, s, "Y")).append(',').append(num(ctx, s, "Z")).append(']')
				.append(",\"fit\":").append(num(ctx, s, "FitDiameterMm")).append('}');
		}
		sb.append("],\"parts\":[");
		List<String> parts = new ArrayList<>();
		Set<String> seen = new HashSet<>();
		List<IMendixObject> lines = Core.createXPathQuery("//ServiceDesk.BomLine[ServiceDesk.BomLine_Bike/ServiceDesk.Product/Sku = $sku]")
			.setVariable("sku", bikeSku).execute(ctx);
		for (IMendixObject line : lines) {
			IMendixIdentifier partId = line.getValue(ctx, "ServiceDesk.BomLine_Part");
			if (partId == null) {
				continue;
			}
			IMendixObject part = Core.retrieveId(ctx, partId);
			String role = "Standard".equals(line.getValue(ctx, "Role")) ? "base" : "component";
			parts.add(part(ctx, part, role, line.getValue(ctx, "Quantity")));
			seen.add(str(ctx, part, "Sku"));
		}
		// what fits: the parts and accessories compatible with this bike, beyond its BOM
		List<IMendixObject> fits = Core.createXPathQuery("//ServiceDesk.Product[ServiceDesk.Product_CompatibleWith/ServiceDesk.Product/Sku = $sku]")
			.setVariable("sku", bikeSku).addSort("Sku", true).execute(ctx);
		for (IMendixObject part : fits) {
			if (seen.add(str(ctx, part, "Sku"))) {
				parts.add(part(ctx, part, "fits", null));
			}
		}
		return sb.append(String.join(",", parts)).append("]}").toString();
	}

	private static String part(IContext ctx, IMendixObject part, String role, Object quantity) throws Exception {
		String sku = str(ctx, part, "Sku");
		StringBuilder sb = new StringBuilder("{\"ref\":").append(SparqlGraph.json(sku))
			.append(",\"label\":").append(SparqlGraph.json(str(ctx, part, "Name")))
			.append(",\"role\":\"").append(role).append('"');
		if (quantity != null) {
			sb.append(",\"quantity\":").append(quantity);
		}
		List<IMendixObject> models = Core.createXPathQuery("//ServiceDesk.PartModel[ServiceDesk.PartModel_Product/ServiceDesk.Product/Sku = $sku]")
			.setVariable("sku", sku).execute(ctx);
		if (models.isEmpty()) {
			return sb.append(",\"shapes\":[]}").toString();
		}
		IMendixObject m = models.get(0);
		sb.append(",\"slot\":").append(SparqlGraph.json(str(ctx, m, "MountsAt")))
			.append(",\"fit\":").append(num(ctx, m, "FitDiameterMm"))
			.append(",\"explode\":[").append(num(ctx, m, "ExplodeX")).append(',').append(num(ctx, m, "ExplodeY")).append(',').append(num(ctx, m, "ExplodeZ")).append(']')
			.append(",\"shapes\":[");
		List<IMendixObject> shapes = Core.createXPathQuery("//ServiceDesk.ShapePart[ServiceDesk.ShapePart_PartModel = $model]")
			.setVariable("model", m.getId().toLong()).addSort("Seq", true).execute(ctx);
		for (int i = 0; i < shapes.size(); i++) {
			IMendixObject s = shapes.get(i);
			sb.append(i > 0 ? "," : "").append("{\"kind\":").append(SparqlGraph.json(str(ctx, s, "Kind")))
				.append(",\"finish\":").append(SparqlGraph.json(str(ctx, s, "Finish")))
				.append(",\"color\":").append(SparqlGraph.json(str(ctx, s, "Color")))
				.append(",\"emissive\":").append(SparqlGraph.json(str(ctx, s, "Emissive")))
				.append(",\"glow\":").append(num(ctx, s, "Glow"))
				.append(",\"opacity\":").append(num(ctx, s, "Opacity"))
				.append(",\"wireframe\":").append(Boolean.TRUE.equals(s.getValue(ctx, "Wireframe")))
				.append(",\"pos\":[").append(num(ctx, s, "X")).append(',').append(num(ctx, s, "Y")).append(',').append(num(ctx, s, "Z")).append(']')
				.append(",\"size\":[").append(num(ctx, s, "SizeA")).append(',').append(num(ctx, s, "SizeB")).append(',').append(num(ctx, s, "SizeC")).append(']')
				.append(",\"rot\":[").append(num(ctx, s, "RotX")).append(',').append(num(ctx, s, "RotY")).append(',').append(num(ctx, s, "RotZ")).append(']')
				.append(",\"segments\":").append(num(ctx, s, "Segments"))
				.append(",\"detail\":").append(num(ctx, s, "Detail")).append('}');
		}
		return sb.append("]}").toString();
	}

	private static String str(IContext ctx, IMendixObject o, String attr) {
		Object v = o.getValue(ctx, attr);
		return v == null ? "" : v.toString();
	}

	private static String num(IContext ctx, IMendixObject o, String attr) {
		Object v = o.getValue(ctx, attr);
		if (v == null) {
			return "null";
		}
		return v instanceof BigDecimal ? ((BigDecimal) v).stripTrailingZeros().toPlainString() : v.toString();
	}
}
