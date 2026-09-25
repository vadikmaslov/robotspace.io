-- Authenticated Comtrade collection refreshes the two most recently completed
-- calendar years. Current-year observations are not inferred before the
-- official annual release exists.
UPDATE sources
SET admin_description = 'Authenticated UN Comtrade API for HS 847950. Retain released aggregate trade values and the declared reporting flag only. Trade is a proxy and must never be labelled as installations or market share.',
    updated_at = now()
WHERE key = 'un-comtrade-industrial-robots';

UPDATE source_contracts
SET rate_limit_strategy = 'Four authenticated aggregate requests weekly; one second apart.',
    parser_version = 'market-stats-v3'
WHERE source_key = 'un-comtrade-industrial-robots';
