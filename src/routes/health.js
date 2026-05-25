/**
 * Healthcheck endpoint pour Railway / k8s / monitoring externe.
 *
 * Verifie :
 *   - mongoose.connection.readyState === 1 (connecte)
 *   - getAgenda() retourne une instance (initialise)
 *
 * Repond :
 *   - 200 { status: 'ok', checks: { mongo: 'ok', agenda: 'ok', uptime } }
 *   - 503 { status: 'degraded', checks: {...} } si une dependance critique KO
 *
 * Route publique : pas d'auth (sinon l'orchestrateur ne peut pas la lire).
 * Pas de rate-limit : Railway/k8s polle frequemment.
 */

const express = require('express');
const mongoose = require('mongoose');

const { getAgenda } = require('../config/cron');

const router = express.Router();

const READY_STATES = {
  0: 'disconnected',
  1: 'connected',
  2: 'connecting',
  3: 'disconnecting',
};

router.get('/', (req, res) => {
  const mongoState = mongoose.connection.readyState;
  const mongoOk = mongoState === 1;
  const agendaInstance = getAgenda();
  const agendaOk = Boolean(agendaInstance);

  const checks = {
    mongo: mongoOk ? 'ok' : `down (${READY_STATES[mongoState] || 'unknown'})`,
    agenda: agendaOk ? 'ok' : 'down',
    uptime_seconds: Math.round(process.uptime()),
  };

  const allOk = mongoOk && agendaOk;

  res.status(allOk ? 200 : 503).json({
    status: allOk ? 'ok' : 'degraded',
    checks,
  });
});

module.exports = router;
