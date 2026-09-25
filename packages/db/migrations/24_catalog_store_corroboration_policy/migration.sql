UPDATE scheduled_agents
SET description = 'Collects validated robot names and canonical URLs from authorised directories, then creates or merges minimal RobotSpace identities. A deterministic Unibot match may attach the Unibot brand and image. RobotLAB store items without corroboration remain NEEDS_REVIEW so accessories and training products are not published as robots. It never copies source descriptions, prices, photos or technical specifications.',
    updated_at = now()
WHERE agent_key = 'catalog-orchestrator';
