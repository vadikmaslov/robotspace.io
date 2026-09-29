-- Queue insertion is part of the request INSERT transaction, including non-web writers.
-- Existing requests are deliberately not replayed: their previous delivery is unknown.
CREATE TABLE request_email_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id uuid UNIQUE REFERENCES submissions(id) ON DELETE CASCADE,
  quote_id uuid UNIQUE REFERENCES quote_requests(id) ON DELETE CASCADE,
  state varchar(20) NOT NULL DEFAULT 'QUEUED' CHECK (state IN ('QUEUED','SENDING','SENT')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  lease_until timestamptz,
  lease_token uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  last_error varchar(50),
  CHECK (num_nonnulls(submission_id, quote_id) = 1)
);
CREATE INDEX request_email_outbox_delivery ON request_email_outbox(state, next_attempt_at);

CREATE FUNCTION queue_request_email() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_TABLE_NAME = 'submissions' THEN
    INSERT INTO request_email_outbox(submission_id) VALUES (NEW.id);
  ELSE
    INSERT INTO request_email_outbox(quote_id) VALUES (NEW.id);
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER submission_email AFTER INSERT ON submissions FOR EACH ROW EXECUTE FUNCTION queue_request_email();
CREATE TRIGGER quote_email AFTER INSERT ON quote_requests FOR EACH ROW EXECUTE FUNCTION queue_request_email();

CREATE FUNCTION mark_quote_email_sent() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.state = 'SENT' AND OLD.state <> 'SENT' AND NEW.quote_id IS NOT NULL THEN
    UPDATE quote_requests SET notification_sent = true, sent_at = NEW.sent_at WHERE id = NEW.quote_id;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER quote_email_sent AFTER UPDATE OF state ON request_email_outbox FOR EACH ROW EXECUTE FUNCTION mark_quote_email_sent();
