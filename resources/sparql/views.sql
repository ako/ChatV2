-- DuckDB views over the attached app database (schema `app`, read-only), shaped
-- for the R2RML mappings in mappings/: one row per resource, values already in
-- their RDF form (codes for IRIs, prices as decimal(10,2), dates as DATE).
-- {VOCAB_DIR} is replaced with this directory by servicedesk.graph.SparqlGraph.

-- The vocabulary (vocab*.ttl): classes and property labels, split by dataset.
create or replace table vocab as
  select 'catalog' as part, subject as s, predicate as p, object as o, object_datatype as dt
  from read_rdf('{VOCAB_DIR}/vocab.ttl', prefix_expansion = true)
  union all select 'orders', subject, predicate, object, object_datatype from read_rdf('{VOCAB_DIR}/vocab-orders.ttl', prefix_expansion = true)
  union all select 'app', subject, predicate, object, object_datatype from read_rdf('{VOCAB_DIR}/vocab-app.ttl', prefix_expansion = true);
create or replace view vocab_catalog_iri as select s, p, o from vocab where part = 'catalog' and o like 'http%';
create or replace view vocab_catalog_lit as select s, p, o from vocab where part = 'catalog' and o not like 'http%';
create or replace view vocab_orders_iri as select s, p, o from vocab where part = 'orders' and o like 'http%';
create or replace view vocab_orders_lit as select s, p, o from vocab where part = 'orders' and o not like 'http%';
create or replace view vocab_app_iri as select s, p, o from vocab where part = 'app' and o like 'http%';
create or replace view vocab_app_lit as select s, p, o from vocab where part = 'app' and o not like 'http%';

-- ---- Catalog ---------------------------------------------------------------
create or replace view supplier as
  select code, name, country from app.public."servicedesk$supplier";

create or replace view product as
  select p.sku, p.name, p.kind, cast(p.price as decimal(10, 2)) as price, p.warrantyyears,
         p.wheelsize, p.seatpostdiameter, p.brakes,
         case when p.kind in ('Bike', 'EBike') then p.rackmount end as rackmount,  -- a bike fact only
         s.code as supplier
  from app.public."servicedesk$product" p
  left join app.public."servicedesk$supplier" s on s.id = p."servicedesk$product_supplier";

-- A bike's bill of materials (26-bike-bom.mdl): fitted parts are what it ships
-- with (shop:hasComponent), standard parts its tyres, tubes, brakes and seat post.
create or replace view product_component as
  select a.sku as sku, b.sku as component
  from app.public."servicedesk$bomline" l
  join app.public."servicedesk$product" a on a.id = l."servicedesk$bomline_bike"
  join app.public."servicedesk$product" b on b.id = l."servicedesk$bomline_part"
  where l.role = 'Fitted';

create or replace view product_standard as
  select a.sku as sku, b.sku as part
  from app.public."servicedesk$bomline" l
  join app.public."servicedesk$product" a on a.id = l."servicedesk$bomline_bike"
  join app.public."servicedesk$product" b on b.id = l."servicedesk$bomline_part"
  where l.role = 'Standard';

-- Where a bike takes parts, and the fit size a part needs (3D viewer data, 26-bike-bom.mdl)
create or replace view mount_point as
  select p.sku, s.code, s.name, cast(s.fitdiametermm as decimal(6, 1)) as fit
  from app.public."servicedesk$mountslot" s
  join app.public."servicedesk$product" p on p.id = s."servicedesk$mountslot_product";

create or replace view part_mount as
  select p.sku, m.mountsat as slot, cast(m.fitdiametermm as decimal(6, 1)) as fit
  from app.public."servicedesk$partmodel" m
  join app.public."servicedesk$product" p on p.id = m."servicedesk$partmodel_product";

create or replace view product_compatible as
  select a.sku as sku, b.sku as target
  from app.public."servicedesk$product_compatiblewith" j
  join app.public."servicedesk$product" a on a.id = j."servicedesk$productid1"
  join app.public."servicedesk$product" b on b.id = j."servicedesk$productid2";

create or replace view known_issue as
  select i.issueid, i.title, case when i.isrecall then 'Recall' else 'KnownIssue' end as cls,
         i.affectsbatch, cast(i.announced as date) as announced, i.advice, p.sku as affects
  from app.public."servicedesk$knownissue" i
  left join app.public."servicedesk$product" p on p.id = i."servicedesk$knownissue_product";

-- ---- Wiki ------------------------------------------------------------------
create or replace view wiki_page as
  select slug, title, summary, tags, cast(updatedat as date) as updated
  from app.public."servicedesk$wikipage";

-- Only links to pages that exist: a [[link]] to a page not written yet is not a fact.
create or replace view wiki_link as
  select distinct f.slug as slug, t.slug as target
  from app.public."servicedesk$wikilink" l
  join app.public."servicedesk$wikipage" f on f.id = l."servicedesk$wikilink_from"
  join app.public."servicedesk$wikipage" t on t.slug = l.toslug;

-- A page mentions a product when its text names the SKU as a word.
create or replace view wiki_mention as
  select w.slug, p.sku
  from app.public."servicedesk$wikipage" w
  join app.public."servicedesk$product" p
    on regexp_matches(coalesce(w.body, '') || ' ' || coalesce(w.title, ''), '(^|[^A-Za-z0-9-])' || p.sku || '($|[^A-Za-z0-9-])');

-- ---- Orders ----------------------------------------------------------------
create or replace view order_line as
  select l.id, o.ordernumber, p.sku, l.quantity, cast(l.unitprice as decimal(10, 2)) as unitprice, l.batch
  from app.public."servicedesk$orderline" l
  join app.public."servicedesk$order" o on o.id = l."servicedesk$orderline_order"
  join app.public."servicedesk$product" p on p.id = l."servicedesk$orderline_product";

-- The product graph's orders: those whose contents the shop recorded.
create or replace view order_with_lines as
  select distinct ordernumber from order_line;

-- ---- The rest of the app (the `app` dataset only) --------------------------
create or replace view shop_order as
  select o.ordernumber, o.status, cast(o.orderdate as date) as orderdate, o."servicedesk$order_customer" as customer
  from app.public."servicedesk$order" o;

create or replace view customer as
  select id, name, company from app.public."servicedesk$customer";

create or replace view ticket as
  select t.ticketnumber, t.subject, t.status, t.category, t.priority, cast(t.createddate as date) as created,
         t."servicedesk$ticket_customer" as customer, o.ordernumber
  from app.public."servicedesk$ticket" t
  left join app.public."servicedesk$order" o on o.id = t."servicedesk$ticket_order";
