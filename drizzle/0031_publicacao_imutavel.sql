CREATE FUNCTION impedir_update_publicacao() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'skill_publicacao is immutable';
END;
$$;
CREATE TRIGGER skill_publicacao_no_update BEFORE UPDATE ON skill_publicacao
FOR EACH ROW EXECUTE FUNCTION impedir_update_publicacao();
