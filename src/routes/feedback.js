const express = require('express');

const {
  normalizeFeedbackPayload,
  sendFeedbackMail,
} = require('../services/feedbackMailService');

const router = express.Router();

router.post('/', async (req, res, next) => {
  try {
    const parsed = normalizeFeedbackPayload(req.body);

    if (!parsed.ok) {
      return res
        .status(parsed.statusCode || 400)
        .json({ message: parsed.message });
    }

    const result = await sendFeedbackMail(parsed.feedback, {
      ip: req.ip,
      userAgent: req.get('user-agent') || '',
    });

    return res.status(202).json({
      message: 'Feedback envoye',
      delivered: result.delivered,
    });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
