
INSERT INTO public.competency_templates (role_type, competency_name, competency_code, description, category, weightage, calculation_formula, icon, sort_order)
VALUES
  ('field_executive', 'Visit Discipline', 'visit_discipline', 'Consistency in completing planned retailer visits', 'discipline', 20, '{"type":"visit_completion_rate"}'::jsonb, 'MapPin', 1),
  ('field_executive', 'Order Conversion', 'order_conversion', 'Ability to convert visits into orders', 'achievement', 20, '{"type":"order_per_visit"}'::jsonb, 'ShoppingCart', 2),
  ('field_executive', 'Productivity', 'productivity', 'Average daily productive activity', 'productivity', 15, '{"type":"daily_activity_rate"}'::jsonb, 'Activity', 3),
  ('field_executive', 'Coverage', 'coverage', 'Breadth of unique retailers covered', 'achievement', 15, '{"type":"unique_retailers"}'::jsonb, 'Users', 4),
  ('field_executive', 'Attendance', 'attendance', 'Regularity of check-in and presence', 'discipline', 15, '{"type":"attendance_rate"}'::jsonb, 'Calendar', 5),
  ('field_executive', 'Collection Efficiency', 'collection_efficiency', 'Payment collection effectiveness', 'achievement', 15, '{"type":"collection_rate"}'::jsonb, 'IndianRupee', 6)
ON CONFLICT DO NOTHING;
