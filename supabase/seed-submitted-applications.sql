insert into applications (
  id,
  application_number,
  submitted_data,
  processing_status,
  attempt_count,
  review_status,
  specialist_notes,
  created_at,
  updated_at,
  processing_started_at,
  processing_finished_at
)
values
  (
    'app-1001',
    'ALC-2026-1001',
    '{
      "brand_name": "Northline",
      "product_name": "Northline Reserve Bourbon",
      "alcohol_content": "40% ALC/VOL",
      "net_contents": "750 ML",
      "origin": "Louisville, Kentucky",
      "government_warning": "Government warning present",
      "applicant_name": "Northline Spirits LLC",
      "application_type": "Distilled spirits label"
    }'::jsonb,
    'processed',
    1,
    'unreviewed',
    null,
    '2026-05-02T14:08:00.000Z',
    '2026-05-02T14:11:00.000Z',
    '2026-05-02T14:09:00.000Z',
    '2026-05-02T14:11:00.000Z'
  ),
  (
    'app-1002',
    'ALC-2026-1002',
    '{
      "brand_name": "Cascadia",
      "product_name": "Cascadia Pinot Gris",
      "alcohol_content": "13.5% ABV",
      "net_contents": "750 mL",
      "origin": "Willamette Valley, Oregon",
      "government_warning": "Government warning present",
      "applicant_name": "Cascadia Cellars",
      "application_type": "Wine label"
    }'::jsonb,
    'processed',
    1,
    'needs_changes',
    'Origin text needs a second look before final approval.',
    '2026-05-02T13:15:00.000Z',
    '2026-05-02T13:39:00.000Z',
    '2026-05-02T13:17:00.000Z',
    '2026-05-02T13:19:00.000Z'
  ),
  (
    'app-1003',
    'ALC-2026-1003',
    '{
      "brand_name": "Harbor Light",
      "product_name": "Harbor Light Lager",
      "alcohol_content": "5.0% ABV",
      "net_contents": "12 FL OZ",
      "origin": "Milwaukee, Wisconsin",
      "government_warning": "Government warning present",
      "applicant_name": "Harbor Light Brewing",
      "application_type": "Malt beverage label"
    }'::jsonb,
    'pending',
    0,
    'unreviewed',
    null,
    '2026-05-02T14:22:00.000Z',
    '2026-05-02T14:22:00.000Z',
    null,
    null
  )
on conflict (id) do update set
  application_number = excluded.application_number,
  submitted_data = excluded.submitted_data,
  processing_status = excluded.processing_status,
  attempt_count = excluded.attempt_count,
  review_status = excluded.review_status,
  specialist_notes = excluded.specialist_notes,
  created_at = excluded.created_at,
  updated_at = excluded.updated_at,
  processing_started_at = excluded.processing_started_at,
  processing_finished_at = excluded.processing_finished_at;

insert into application_images (
  id,
  application_id,
  image_url,
  label_type,
  original_filename,
  mime_type,
  width_px,
  height_px,
  created_at
)
values
  (
    'img-1001-front',
    'app-1001',
    'data:image/svg+xml;utf8,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 600"%3E%3Crect width="900" height="600" fill="white"/%3E%3Ctext x="450" y="240" text-anchor="middle" font-family="Arial" font-size="64"%3ENORTHLINE%3C/text%3E%3Ctext x="450" y="330" text-anchor="middle" font-family="Arial" font-size="44"%3EReserve Bourbon%3C/text%3E%3C/svg%3E',
    'front',
    'northline-front.png',
    'image/png',
    1800,
    1200,
    '2026-05-02T14:08:00.000Z'
  ),
  (
    'img-1001-back',
    'app-1001',
    'data:image/svg+xml;utf8,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 600"%3E%3Crect width="900" height="600" fill="white"/%3E%3Ctext x="450" y="240" text-anchor="middle" font-family="Arial" font-size="64"%3ENORTHLINE%3C/text%3E%3Ctext x="450" y="330" text-anchor="middle" font-family="Arial" font-size="44"%3EBack Label%3C/text%3E%3C/svg%3E',
    'government_warning',
    'northline-back.png',
    'image/png',
    1800,
    1200,
    '2026-05-02T14:08:00.000Z'
  ),
  (
    'img-1002-front',
    'app-1002',
    'data:image/svg+xml;utf8,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 600"%3E%3Crect width="900" height="600" fill="white"/%3E%3Ctext x="450" y="240" text-anchor="middle" font-family="Arial" font-size="64"%3ECASCADIA%3C/text%3E%3Ctext x="450" y="330" text-anchor="middle" font-family="Arial" font-size="44"%3EPinot Gris%3C/text%3E%3C/svg%3E',
    'front',
    'cascadia-front.png',
    'image/png',
    1800,
    1200,
    '2026-05-02T13:15:00.000Z'
  ),
  (
    'img-1002-back',
    'app-1002',
    'data:image/svg+xml;utf8,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 600"%3E%3Crect width="900" height="600" fill="white"/%3E%3Ctext x="450" y="240" text-anchor="middle" font-family="Arial" font-size="64"%3ECASCADIA%3C/text%3E%3Ctext x="450" y="330" text-anchor="middle" font-family="Arial" font-size="44"%3EImported Wine%3C/text%3E%3C/svg%3E',
    'back',
    'cascadia-back.png',
    'image/png',
    1800,
    1200,
    '2026-05-02T13:15:00.000Z'
  ),
  (
    'img-1003-front',
    'app-1003',
    'data:image/svg+xml;utf8,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 600"%3E%3Crect width="900" height="600" fill="white"/%3E%3Ctext x="450" y="240" text-anchor="middle" font-family="Arial" font-size="64"%3EHARBOR LIGHT%3C/text%3E%3Ctext x="450" y="330" text-anchor="middle" font-family="Arial" font-size="44"%3ELager%3C/text%3E%3C/svg%3E',
    'front',
    'harbor-light-front.png',
    'image/png',
    1800,
    1200,
    '2026-05-02T14:22:00.000Z'
  )
on conflict (id) do update set
  application_id = excluded.application_id,
  image_url = excluded.image_url,
  label_type = excluded.label_type,
  original_filename = excluded.original_filename,
  mime_type = excluded.mime_type,
  width_px = excluded.width_px,
  height_px = excluded.height_px,
  created_at = excluded.created_at;

insert into ocr_text_blocks (
  id,
  application_id,
  image_id,
  text,
  confidence,
  bbox,
  page_section,
  block_order,
  line_number,
  created_at
)
values
  ('ocr-1001-brand', 'app-1001', 'img-1001-front', 'NORTHLINE', 0.98, '{"x":10.5,"y":16,"width":79,"height":18}'::jsonb, 'top', 1, 1, '2026-05-02T14:12:00.000Z'),
  ('ocr-1001-product', 'app-1001', 'img-1001-front', 'Reserve Bourbon', 0.96, '{"x":25,"y":43,"width":50,"height":9}'::jsonb, 'middle', 2, 2, '2026-05-02T14:12:00.000Z'),
  ('ocr-1001-abv', 'app-1001', 'img-1001-front', '40% ALC/VOL', 0.94, '{"x":34,"y":55,"width":32,"height":6}'::jsonb, 'middle', 3, 3, '2026-05-02T14:12:00.000Z'),
  ('ocr-1001-net', 'app-1001', 'img-1001-front', '750 ML', 0.91, '{"x":53,"y":55,"width":16,"height":6}'::jsonb, 'middle', 4, 4, '2026-05-02T14:12:00.000Z'),
  ('ocr-1001-warning', 'app-1001', 'img-1001-back', 'GOVERNMENT WARNING', 0.93, '{"x":24,"y":66,"width":52,"height":8}'::jsonb, 'bottom', 5, 5, '2026-05-02T14:12:00.000Z'),
  ('ocr-1001-origin', 'app-1001', 'img-1001-back', 'Louisville, Kentucky', 0.9, '{"x":27,"y":87,"width":46,"height":6}'::jsonb, 'bottom', 6, 6, '2026-05-02T14:12:00.000Z'),
  ('ocr-1002-brand', 'app-1002', 'img-1002-front', 'CASCADIA', 0.97, '{"x":10.5,"y":16,"width":79,"height":18}'::jsonb, 'top', 1, 1, '2026-05-02T14:12:00.000Z'),
  ('ocr-1002-product', 'app-1002', 'img-1002-front', 'Pinot Gris', 0.94, '{"x":31,"y":43,"width":38,"height":9}'::jsonb, 'middle', 2, 2, '2026-05-02T14:12:00.000Z'),
  ('ocr-1002-abv', 'app-1002', 'img-1002-front', '13.5% ABV', 0.86, '{"x":34,"y":55,"width":32,"height":6}'::jsonb, 'middle', 3, 3, '2026-05-02T14:12:00.000Z'),
  ('ocr-1002-net', 'app-1002', 'img-1002-front', '750 mL', 0.88, '{"x":53,"y":55,"width":16,"height":6}'::jsonb, 'middle', 4, 4, '2026-05-02T14:12:00.000Z'),
  ('ocr-1002-warning', 'app-1002', 'img-1002-back', 'GOVERNMENT WARNING', 0.84, '{"x":24,"y":66,"width":52,"height":8}'::jsonb, 'bottom', 5, 5, '2026-05-02T14:12:00.000Z'),
  ('ocr-1002-origin', 'app-1002', 'img-1002-back', 'Imported Wine', 0.62, '{"x":31,"y":43,"width":38,"height":9}'::jsonb, 'middle', 6, 6, '2026-05-02T14:12:00.000Z')
on conflict (id) do update set
  application_id = excluded.application_id,
  image_id = excluded.image_id,
  text = excluded.text,
  confidence = excluded.confidence,
  bbox = excluded.bbox,
  page_section = excluded.page_section,
  block_order = excluded.block_order,
  line_number = excluded.line_number,
  created_at = excluded.created_at;

insert into extracted_fields (
  id,
  application_id,
  field_key,
  field_label,
  extracted_value,
  normalized_value,
  confidence,
  extraction_status,
  explanation,
  created_at
)
values
  ('field-1001-brand', 'app-1001', 'brand_name', 'Brand name', 'Northline', 'northline', 0.98, 'found', 'High confidence match on the front label.', '2026-05-02T14:12:00.000Z'),
  ('field-1001-product', 'app-1001', 'product_name', 'Product name', 'Northline Reserve Bourbon', 'northline reserve bourbon', 0.96, 'found', 'Product identity appears on the front label.', '2026-05-02T14:12:00.000Z'),
  ('field-1001-abv', 'app-1001', 'alcohol_content', 'Alcohol content', '40% ALC/VOL', '40% alc/vol', 0.94, 'found', 'Alcohol content is legible.', '2026-05-02T14:12:00.000Z'),
  ('field-1001-net', 'app-1001', 'net_contents', 'Net contents', '750 ML', '750 ml', 0.91, 'found', 'Net contents found near the alcohol content line.', '2026-05-02T14:12:00.000Z'),
  ('field-1001-warning', 'app-1001', 'government_warning', 'Government warning', 'GOVERNMENT WARNING', 'government warning', 0.93, 'found', 'Required warning heading is visible.', '2026-05-02T14:12:00.000Z'),
  ('field-1001-origin', 'app-1001', 'origin', 'Origin', 'Louisville, Kentucky', 'louisville, kentucky', 0.9, 'found', 'Origin text appears on the back label.', '2026-05-02T14:12:00.000Z'),
  ('field-1002-brand', 'app-1002', 'brand_name', 'Brand name', 'Cascadia', 'cascadia', 0.97, 'found', 'High confidence match on the front label.', '2026-05-02T14:12:00.000Z'),
  ('field-1002-product', 'app-1002', 'product_name', 'Product name', 'Cascadia Pinot Gris', 'cascadia pinot gris', 0.94, 'found', 'Product identity appears on the front label.', '2026-05-02T14:12:00.000Z'),
  ('field-1002-abv', 'app-1002', 'alcohol_content', 'Alcohol content', '13.5% ABV', '13.5% abv', 0.86, 'found', 'Alcohol content is readable but slightly low confidence.', '2026-05-02T14:12:00.000Z'),
  ('field-1002-net', 'app-1002', 'net_contents', 'Net contents', '750 mL', '750 ml', 0.88, 'found', 'Net contents found near the alcohol content line.', '2026-05-02T14:12:00.000Z'),
  ('field-1002-warning', 'app-1002', 'government_warning', 'Government warning', 'GOVERNMENT WARNING', 'government warning', 0.84, 'found', 'Warning heading is present.', '2026-05-02T14:12:00.000Z'),
  ('field-1002-origin', 'app-1002', 'origin', 'Origin', 'Imported Wine', 'imported wine', 0.62, 'conflict', 'Origin text conflicts with the submitted origin.', '2026-05-02T14:12:00.000Z')
on conflict (id) do update set
  application_id = excluded.application_id,
  field_key = excluded.field_key,
  field_label = excluded.field_label,
  extracted_value = excluded.extracted_value,
  normalized_value = excluded.normalized_value,
  confidence = excluded.confidence,
  extraction_status = excluded.extraction_status,
  explanation = excluded.explanation,
  created_at = excluded.created_at;

insert into extracted_field_evidence (
  id,
  extracted_field_id,
  image_id,
  ocr_text_block_id,
  evidence_text,
  confidence,
  bbox,
  evidence_rank,
  created_at
)
values
  ('ev-1001-brand', 'field-1001-brand', 'img-1001-front', 'ocr-1001-brand', 'NORTHLINE', 0.98, '{"x":10.5,"y":16,"width":79,"height":18}'::jsonb, 1, '2026-05-02T14:12:00.000Z'),
  ('ev-1001-product', 'field-1001-product', 'img-1001-front', 'ocr-1001-product', 'Reserve Bourbon', 0.96, '{"x":25,"y":43,"width":50,"height":9}'::jsonb, 1, '2026-05-02T14:12:00.000Z'),
  ('ev-1001-abv', 'field-1001-abv', 'img-1001-front', 'ocr-1001-abv', '40% ALC/VOL', 0.94, '{"x":34,"y":55,"width":32,"height":6}'::jsonb, 1, '2026-05-02T14:12:00.000Z'),
  ('ev-1001-net', 'field-1001-net', 'img-1001-front', 'ocr-1001-net', '750 ML', 0.91, '{"x":53,"y":55,"width":16,"height":6}'::jsonb, 1, '2026-05-02T14:12:00.000Z'),
  ('ev-1001-warning', 'field-1001-warning', 'img-1001-back', 'ocr-1001-warning', 'GOVERNMENT WARNING', 0.93, '{"x":24,"y":66,"width":52,"height":8}'::jsonb, 1, '2026-05-02T14:12:00.000Z'),
  ('ev-1001-origin', 'field-1001-origin', 'img-1001-back', 'ocr-1001-origin', 'Louisville, Kentucky', 0.9, '{"x":27,"y":87,"width":46,"height":6}'::jsonb, 1, '2026-05-02T14:12:00.000Z'),
  ('ev-1002-brand', 'field-1002-brand', 'img-1002-front', 'ocr-1002-brand', 'CASCADIA', 0.97, '{"x":10.5,"y":16,"width":79,"height":18}'::jsonb, 1, '2026-05-02T14:12:00.000Z'),
  ('ev-1002-product', 'field-1002-product', 'img-1002-front', 'ocr-1002-product', 'Pinot Gris', 0.94, '{"x":31,"y":43,"width":38,"height":9}'::jsonb, 1, '2026-05-02T14:12:00.000Z'),
  ('ev-1002-abv', 'field-1002-abv', 'img-1002-front', 'ocr-1002-abv', '13.5% ABV', 0.86, '{"x":34,"y":55,"width":32,"height":6}'::jsonb, 1, '2026-05-02T14:12:00.000Z'),
  ('ev-1002-net', 'field-1002-net', 'img-1002-front', 'ocr-1002-net', '750 mL', 0.88, '{"x":53,"y":55,"width":16,"height":6}'::jsonb, 1, '2026-05-02T14:12:00.000Z'),
  ('ev-1002-warning', 'field-1002-warning', 'img-1002-back', 'ocr-1002-warning', 'GOVERNMENT WARNING', 0.84, '{"x":24,"y":66,"width":52,"height":8}'::jsonb, 1, '2026-05-02T14:12:00.000Z'),
  ('ev-1002-origin', 'field-1002-origin', 'img-1002-back', 'ocr-1002-origin', 'Imported Wine', 0.62, '{"x":31,"y":43,"width":38,"height":9}'::jsonb, 1, '2026-05-02T14:12:00.000Z')
on conflict (id) do update set
  extracted_field_id = excluded.extracted_field_id,
  image_id = excluded.image_id,
  ocr_text_block_id = excluded.ocr_text_block_id,
  evidence_text = excluded.evidence_text,
  confidence = excluded.confidence,
  bbox = excluded.bbox,
  evidence_rank = excluded.evidence_rank,
  created_at = excluded.created_at;

insert into validation_results (
  id,
  application_id,
  field_key,
  check_key,
  check_label,
  result_status,
  submitted_value,
  extracted_value,
  score,
  message,
  created_at
)
values
  ('val-1001-brand', 'app-1001', 'brand_name', 'matches_application', 'Matches application', 'pass', 'Northline', 'Northline', 0.98, null, '2026-05-02T14:12:00.000Z'),
  ('val-1001-product', 'app-1001', 'product_name', 'matches_application', 'Matches application', 'pass', 'Northline Reserve Bourbon', 'Northline Reserve Bourbon', 0.96, null, '2026-05-02T14:12:00.000Z'),
  ('val-1001-warning', 'app-1001', 'government_warning', 'required_field_present', 'Required field present', 'pass', 'Government warning present', 'GOVERNMENT WARNING', 0.93, null, '2026-05-02T14:12:00.000Z'),
  ('val-1002-brand', 'app-1002', 'brand_name', 'matches_application', 'Matches application', 'pass', 'Cascadia', 'Cascadia', 0.97, null, '2026-05-02T14:12:00.000Z'),
  ('val-1002-origin', 'app-1002', 'origin', 'matches_application', 'Matches application', 'warning', 'Willamette Valley, Oregon', 'Imported Wine', 0.42, 'Origin evidence may conflict with submitted data.', '2026-05-02T14:12:00.000Z')
on conflict (id) do update set
  application_id = excluded.application_id,
  field_key = excluded.field_key,
  check_key = excluded.check_key,
  check_label = excluded.check_label,
  result_status = excluded.result_status,
  submitted_value = excluded.submitted_value,
  extracted_value = excluded.extracted_value,
  score = excluded.score,
  message = excluded.message,
  created_at = excluded.created_at;
