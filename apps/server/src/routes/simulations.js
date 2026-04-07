export async function registerSimulationRoutes(app) {
  app.post('/api/simulations', async (request, reply) => {
    const match = app.simulationService.createSimulation(request.body)
    return reply.code(201).send({
      matchId: match.matchId,
      kind: match.kind,
      status: match.status,
      replayUrl: `/api/matches/${match.matchId}/replay`,
    })
  })
}
