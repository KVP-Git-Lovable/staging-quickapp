GRANT SELECT ON public.products TO anon;
GRANT SELECT ON public.uom_master TO anon;
GRANT SELECT ON public.enabled_units TO anon;
GRANT SELECT ON public.product_schemes TO anon;

CREATE POLICY "Allow anon read active products for portal"
ON public.products FOR SELECT TO anon USING (is_active = true);

CREATE POLICY "Allow anon read uom_master for portal"
ON public.uom_master FOR SELECT TO anon USING (true);

CREATE POLICY "Allow anon read enabled_units for portal"
ON public.enabled_units FOR SELECT TO anon USING (true);

CREATE POLICY "Allow anon read portal schemes"
ON public.product_schemes FOR SELECT TO anon USING (is_active = true AND show_in_portal = true);