-- Probe the current calendar year as well as the two completed years. An
-- observation is inserted only when UN Comtrade returns an official annual row.
UPDATE source_contracts
SET rate_limit_strategy = 'Six authenticated aggregate requests weekly; one second apart.',
    parser_version = 'market-stats-v4'
WHERE source_key = 'un-comtrade-industrial-robots';
