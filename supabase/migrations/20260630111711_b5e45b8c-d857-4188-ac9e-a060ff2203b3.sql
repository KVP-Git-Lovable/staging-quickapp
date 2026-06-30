create or replace function public.create_product_with_uoms(
  p_product jsonb,
  p_uoms jsonb default '[]'::jsonb,
  p_price_overrides jsonb default '[]'::jsonb
) returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_product_id uuid;
  v_base uuid; v_sales uuid; v_purchase uuid; v_price uuid;
  v_u jsonb; v_p jsonb;
begin
  if coalesce(p_product->>'name','')='' or coalesce(p_product->>'sku','')='' then
    raise exception 'Product name and SKU are required';
  end if;

  insert into public.products(
    sku, product_number, name, description, category_id, rate,
    base_unit_category, conversion_factor, closing_stock, is_active,
    sku_image_url, is_focused_product, focused_due_date,
    focused_target_quantity, focused_territories, barcode, qr_code,
    hsn_code, tax_master_id, gst_percentage, product_type,
    gross_weight_g, packaging_weight_g, standard_cost, cost_currency,
    reorder_quantity, primary_supplier_id, manufacturer, country_of_origin,
    is_discontinued, discontinued_date, discontinuation_reason
  )
  values (
    p_product->>'sku',
    nullif(p_product->>'product_number',''),
    p_product->>'name',
    nullif(p_product->>'description',''),
    nullif(p_product->>'category_id','')::uuid,
    nullif(p_product->>'rate','')::numeric,
    nullif(p_product->>'base_unit_category',''),
    nullif(p_product->>'conversion_factor','')::numeric,
    nullif(p_product->>'closing_stock','')::numeric,
    coalesce((p_product->>'is_active')::boolean, true),
    nullif(p_product->>'sku_image_url',''),
    coalesce((p_product->>'is_focused_product')::boolean, false),
    nullif(p_product->>'focused_due_date','')::date,
    coalesce((p_product->>'focused_target_quantity')::numeric, 0),
    coalesce(
      case when jsonb_typeof(p_product->'focused_territories')='array'
           then (select array_agg(value::text) from jsonb_array_elements_text(p_product->'focused_territories'))
           else null end, '{}'::text[]),
    nullif(p_product->>'barcode',''),
    nullif(p_product->>'qr_code',''),
    nullif(p_product->>'hsn_code',''),
    nullif(p_product->>'tax_master_id','')::uuid,
    nullif(p_product->>'gst_percentage','')::numeric,
    coalesce(nullif(p_product->>'product_type',''),'Finished Good'),
    nullif(p_product->>'gross_weight_g','')::numeric,
    nullif(p_product->>'packaging_weight_g','')::numeric,
    nullif(p_product->>'standard_cost','')::numeric,
    coalesce(nullif(p_product->>'cost_currency',''),'INR'),
    nullif(p_product->>'reorder_quantity','')::numeric,
    nullif(p_product->>'primary_supplier_id','')::uuid,
    nullif(p_product->>'manufacturer',''),
    nullif(p_product->>'country_of_origin',''),
    coalesce((p_product->>'is_discontinued')::boolean, false),
    nullif(p_product->>'discontinued_date','')::date,
    nullif(p_product->>'discontinuation_reason','')
  ) returning id into v_product_id;

  for v_u in select * from jsonb_array_elements(coalesce(p_uoms,'[]'::jsonb)) loop
    insert into public.product_uom_mapping(
      product_id, uom_id, conversion_to_base,
      is_base, is_default_sales, is_default_purchase, is_price_basis, is_active)
    values (
      v_product_id,
      (v_u->>'uom_id')::uuid,
      coalesce((v_u->>'conversion_to_base')::numeric, 1),
      coalesce((v_u->>'is_base')::boolean, false),
      coalesce((v_u->>'is_default_sales')::boolean, false),
      coalesce((v_u->>'is_default_purchase')::boolean, false),
      coalesce((v_u->>'is_price_basis')::boolean, false),
      coalesce((v_u->>'is_active')::boolean, true));
    if coalesce((v_u->>'is_base')::boolean,false)            then v_base := (v_u->>'uom_id')::uuid; end if;
    if coalesce((v_u->>'is_default_sales')::boolean,false)   then v_sales := (v_u->>'uom_id')::uuid; end if;
    if coalesce((v_u->>'is_default_purchase')::boolean,false)then v_purchase := (v_u->>'uom_id')::uuid; end if;
    if coalesce((v_u->>'is_price_basis')::boolean,false)     then v_price := (v_u->>'uom_id')::uuid; end if;
  end loop;

  update public.products p set
    default_sales_uom_id    = coalesce(v_sales, p.default_sales_uom_id),
    default_purchase_uom_id = coalesce(v_purchase, p.default_purchase_uom_id),
    price_basis_uom_id      = coalesce(v_price, v_sales, p.price_basis_uom_id),
    base_unit          = coalesce((select code from public.uom_master where id = v_base), p.base_unit),
    base_unit_category = coalesce((select category from public.uom_master where id = v_base), p.base_unit_category)
  where p.id = v_product_id;

  for v_p in select * from jsonb_array_elements(coalesce(p_price_overrides,'[]'::jsonb)) loop
    insert into public.product_price_list(product_id, uom_id, rate, is_default_price, notes)
    values (
      v_product_id,
      (v_p->>'uom_id')::uuid,
      (v_p->>'rate')::numeric,
      coalesce((v_p->>'is_default_price')::boolean, false),
      nullif(v_p->>'notes',''));
  end loop;

  return v_product_id;
end $$;

create or replace function public.update_product_with_uoms(
  p_product_id uuid, p_product jsonb,
  p_uoms jsonb default '[]'::jsonb, p_price_overrides jsonb default '[]'::jsonb
) returns uuid
language plpgsql security definer set search_path = public
as $$
declare v_base uuid; v_sales uuid; v_purchase uuid; v_price uuid; v_u jsonb; v_p jsonb;
begin
  update public.products set
    sku                    = coalesce(nullif(p_product->>'sku',''), sku),
    product_number         = nullif(p_product->>'product_number',''),
    name                   = coalesce(nullif(p_product->>'name',''), name),
    description            = nullif(p_product->>'description',''),
    category_id            = nullif(p_product->>'category_id','')::uuid,
    rate                   = nullif(p_product->>'rate','')::numeric,
    base_unit_category     = coalesce(nullif(p_product->>'base_unit_category',''), base_unit_category),
    conversion_factor      = nullif(p_product->>'conversion_factor','')::numeric,
    closing_stock          = nullif(p_product->>'closing_stock','')::numeric,
    is_active              = coalesce((p_product->>'is_active')::boolean, is_active),
    sku_image_url          = nullif(p_product->>'sku_image_url',''),
    is_focused_product     = coalesce((p_product->>'is_focused_product')::boolean, is_focused_product),
    focused_due_date       = nullif(p_product->>'focused_due_date','')::date,
    focused_target_quantity= coalesce((p_product->>'focused_target_quantity')::numeric, 0),
    focused_territories    = coalesce(
      case when jsonb_typeof(p_product->'focused_territories')='array'
           then (select array_agg(value::text) from jsonb_array_elements_text(p_product->'focused_territories'))
           else null end, focused_territories),
    barcode                = nullif(p_product->>'barcode',''),
    qr_code                = nullif(p_product->>'qr_code',''),
    hsn_code               = nullif(p_product->>'hsn_code',''),
    tax_master_id          = nullif(p_product->>'tax_master_id','')::uuid,
    gst_percentage         = nullif(p_product->>'gst_percentage','')::numeric,
    product_type           = coalesce(nullif(p_product->>'product_type',''), product_type),
    gross_weight_g         = nullif(p_product->>'gross_weight_g','')::numeric,
    packaging_weight_g     = nullif(p_product->>'packaging_weight_g','')::numeric,
    standard_cost          = nullif(p_product->>'standard_cost','')::numeric,
    cost_currency          = coalesce(nullif(p_product->>'cost_currency',''), cost_currency),
    reorder_quantity       = nullif(p_product->>'reorder_quantity','')::numeric,
    primary_supplier_id    = nullif(p_product->>'primary_supplier_id','')::uuid,
    manufacturer           = nullif(p_product->>'manufacturer',''),
    country_of_origin      = nullif(p_product->>'country_of_origin',''),
    is_discontinued        = coalesce((p_product->>'is_discontinued')::boolean, is_discontinued),
    discontinued_date      = nullif(p_product->>'discontinued_date','')::date,
    discontinuation_reason = nullif(p_product->>'discontinuation_reason','')
  where id = p_product_id;

  if coalesce(jsonb_array_length(p_uoms),0) > 0 then
    delete from public.product_uom_mapping where product_id = p_product_id;
    for v_u in select * from jsonb_array_elements(p_uoms) loop
      insert into public.product_uom_mapping(product_id, uom_id, conversion_to_base, is_base, is_default_sales, is_default_purchase, is_price_basis, is_active)
      values (p_product_id, (v_u->>'uom_id')::uuid, coalesce((v_u->>'conversion_to_base')::numeric,1),
              coalesce((v_u->>'is_base')::boolean,false), coalesce((v_u->>'is_default_sales')::boolean,false),
              coalesce((v_u->>'is_default_purchase')::boolean,false), coalesce((v_u->>'is_price_basis')::boolean,false),
              coalesce((v_u->>'is_active')::boolean,true));
      if coalesce((v_u->>'is_base')::boolean,false)            then v_base := (v_u->>'uom_id')::uuid; end if;
      if coalesce((v_u->>'is_default_sales')::boolean,false)   then v_sales := (v_u->>'uom_id')::uuid; end if;
      if coalesce((v_u->>'is_default_purchase')::boolean,false)then v_purchase := (v_u->>'uom_id')::uuid; end if;
      if coalesce((v_u->>'is_price_basis')::boolean,false)     then v_price := (v_u->>'uom_id')::uuid; end if;
    end loop;

    update public.products p set
      default_sales_uom_id    = coalesce(v_sales, p.default_sales_uom_id),
      default_purchase_uom_id = coalesce(v_purchase, p.default_purchase_uom_id),
      price_basis_uom_id      = coalesce(v_price, v_sales, p.price_basis_uom_id),
      base_unit          = coalesce((select code from public.uom_master where id=v_base), p.base_unit),
      base_unit_category = coalesce((select category from public.uom_master where id=v_base), p.base_unit_category)
    where p.id = p_product_id;
  end if;

  if coalesce(jsonb_array_length(p_price_overrides),0) > 0 then
    delete from public.product_price_list where product_id = p_product_id;
    for v_p in select * from jsonb_array_elements(p_price_overrides) loop
      insert into public.product_price_list(product_id, uom_id, rate, is_default_price, notes)
      values (p_product_id, (v_p->>'uom_id')::uuid, (v_p->>'rate')::numeric,
              coalesce((v_p->>'is_default_price')::boolean,false), nullif(v_p->>'notes',''));
    end loop;
  end if;

  return p_product_id;
end $$;

grant execute on function public.create_product_with_uoms(jsonb,jsonb,jsonb) to authenticated;
grant execute on function public.update_product_with_uoms(uuid,jsonb,jsonb,jsonb) to authenticated;