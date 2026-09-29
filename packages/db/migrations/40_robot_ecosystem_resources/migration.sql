CREATE TABLE robot_resources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  robot_entity_id uuid NOT NULL REFERENCES entities(id) ON DELETE RESTRICT,
  resource_type text NOT NULL CHECK (resource_type IN ('WEBSITE','DOCS','SDK','GITHUB','ROS','ROS2','HUGGING_FACE','FIRMWARE')),
  title varchar(255) NOT NULL CHECK (length(trim(title)) > 0),
  url varchar(2000) NOT NULL CHECK (url ~ '^https://'),
  evidence_url varchar(2000) NOT NULL CHECK (evidence_url ~ '^https://'),
  verification_status text NOT NULL DEFAULT 'VERIFIED' CHECK (verification_status IN ('VERIFIED','REJECTED')),
  verified_at timestamptz(6) NOT NULL DEFAULT now(),
  created_by varchar(255) NOT NULL,
  created_at timestamptz(6) NOT NULL DEFAULT now(),
  updated_at timestamptz(6) NOT NULL DEFAULT now(),
  UNIQUE(robot_entity_id, resource_type, url)
);
CREATE INDEX robot_resources_public ON robot_resources(robot_entity_id, verification_status, resource_type);

CREATE FUNCTION robot_resource_identity_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM entities WHERE id=NEW.robot_entity_id AND entity_type='ROBOT' AND archived_at IS NULL) THEN
    RAISE EXCEPTION 'Robot resource requires an active robot entity';
  END IF;
  IF TG_OP='UPDATE' AND (
    NEW.robot_entity_id<>OLD.robot_entity_id OR NEW.resource_type<>OLD.resource_type OR
    NEW.url<>OLD.url OR NEW.evidence_url<>OLD.evidence_url OR NEW.created_by<>OLD.created_by OR
    NEW.created_at<>OLD.created_at
  ) THEN RAISE EXCEPTION 'Robot resource identity and evidence are immutable'; END IF;
  IF TG_OP='UPDATE' AND OLD.verification_status='REJECTED' AND NEW.verification_status<>'REJECTED' THEN
    RAISE EXCEPTION 'Rejected robot resources cannot be restored';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;
CREATE TRIGGER robot_resource_identity BEFORE INSERT OR UPDATE ON robot_resources
  FOR EACH ROW EXECUTE FUNCTION robot_resource_identity_guard();
