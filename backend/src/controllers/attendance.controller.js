const { validationResult } = require('express-validator');
const attendanceService = require('../services/attendance.service');
const auditService = require('../services/audit.service');

const getAll = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, error: errors.array()[0].msg });
    const filters = {
      userId: req.user.role === 'ADMIN' ? (req.query.userId || undefined) : req.user.id,
      month: req.query.month || undefined,
      year: req.query.year || undefined,
    };

    const entries = await attendanceService.getAll(filters);
    res.json({ success: true, data: entries });
  } catch (error) {
    next(error);
  }
};

const upsert = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, error: errors.array()[0].msg });
    }

    const entry = await attendanceService.upsert(req.body);
    await auditService.record(req, { action: 'UPSERT', entity: 'Attendance', entityId: entry.id, employeeId: entry.userId, newData: entry });
    res.status(200).json({ success: true, data: entry });
  } catch (error) {
    if (error.message.includes('no existe')) {
      return res.status(400).json({ success: false, error: error.message });
    }
    next(error);
  }
};

const clockInSession=async(req,res,next)=>{try{const errors=validationResult(req);if(!errors.isEmpty())return res.status(400).json({success:false,error:errors.array()[0].msg});const row=await attendanceService.clockInSession(req.body.userId,req.user.id,req.body.notes);await auditService.record(req,{action:'CLOCK_IN',entity:'AttendanceSession',entityId:row.id,employeeId:row.userId,newData:row});res.status(201).json({success:true,data:row})}catch(e){if(/no existe|pendiente/i.test(e.message))e.statusCode=400;next(e)}};
const clockOutSession=async(req,res,next)=>{try{const errors=validationResult(req);if(!errors.isEmpty())return res.status(400).json({success:false,error:errors.array()[0].msg});const row=await attendanceService.clockOutSession(req.params.id,req.user.id);await auditService.record(req,{action:'CLOCK_OUT',entity:'AttendanceSession',entityId:row.id,employeeId:row.userId,newData:row});res.json({success:true,data:row})}catch(e){if(/no encontr|ya fue|posterior/i.test(e.message))e.statusCode=400;next(e)}};
const justifySession = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, error: errors.array()[0].msg });
    }

    const row = await attendanceService.justifySession(req.params.id, req.body, req.user.id);
    await auditService.record(req, {
      action: req.body.status,
      entity: 'AttendanceJustification',
      entityId: row.id,
      employeeId: row.userId,
      newData: row,
      reason: req.body.decisionReason || req.body.reason,
    });
    res.json({ success: true, data: row });
  } catch (error) {
    next(error);
  }
};
module.exports = { getAll, upsert, clockInSession, clockOutSession, justifySession };
