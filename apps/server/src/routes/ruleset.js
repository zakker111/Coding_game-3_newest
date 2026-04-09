import { LOADOUT_SLOT_COUNT, MODULE_DEFINITIONS, MODULE_IDS, RULESET_VERSION } from '@coding-game/ruleset'

export async function registerRulesetRoutes(app) {
  app.get('/api/ruleset', async () => ({
    rulesetVersion: RULESET_VERSION,
    loadoutSlotCount: LOADOUT_SLOT_COUNT,
    modules: MODULE_IDS.map((moduleId) => MODULE_DEFINITIONS[moduleId]),
  }))
}
