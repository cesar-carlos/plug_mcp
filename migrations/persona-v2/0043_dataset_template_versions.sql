-- Exact-template editorial choices, without reading encrypted dataset rows.
CREATE INDEX knowledge_library_dataset_template_versions_v2
 ON knowledge_library_version_v2(catalog_id,template_id,template_version,library_id DESC,version DESC)
 WHERE template_id IS NOT NULL;
