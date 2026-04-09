export async function registerRulesetRoutes(app) {
  app.get('/api/ruleset', async () => app.simulationService.getRuleset())
}
