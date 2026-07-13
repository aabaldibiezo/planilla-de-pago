const prisma = require('../lib/prisma');

/**
 * Get current date (YYYY-MM-DD) and time (HH:MM) in Bolivia timezone (America/La_Paz)
 */
const getBoliviaTime = () => {
  const options = {
    timeZone: 'America/La_Paz',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  };
  
  const formatter = new Intl.DateTimeFormat('es-BO', options);
  const parts = formatter.formatToParts(new Date());
  
  const partMap = {};
  parts.forEach(p => partMap[p.type] = p.value);
  
  const dateStr = `${partMap.year}-${partMap.month}-${partMap.day}`; // YYYY-MM-DD
  const timeStr = `${partMap.hour}:${partMap.minute}`; // HH:MM
  
  return { dateStr, timeStr };
};

/**
 * Calculate delay minutes between scheduled entry time and actual entry time.
 */
const calculateDelayMinutes = (scheduled, actual) => {
  const [schH, schM] = scheduled.split(':').map(Number);
  const [actH, actM] = actual.split(':').map(Number);

  const schMinutes = schH * 60 + schM;
  const actMinutes = actH * 60 + actM;

  const diff = actMinutes - schMinutes;
  return diff > 0 ? diff : 0;
};

/**
 * Calculate hours between actual entry time (HH:MM) and actual exit time (HH:MM).
 */
const calculateWorkedHours = (actualEntry, actualExit) => {
  const [inH, inM] = actualEntry.split(':').map(Number);
  const [outH, outM] = actualExit.split(':').map(Number);

  const inMinutes = inH * 60 + inM;
  const outMinutes = outH * 60 + outM;

  let diffMinutes = outMinutes - inMinutes;
  if (diffMinutes < 0) {
    diffMinutes += 24 * 60; // Handle overnight shifts
  }

  return parseFloat((diffMinutes / 60).toFixed(2));
};

const boliviaDateTime = () => {
  const { dateStr, timeStr } = getBoliviaTime();
  return { dateStr, timeStr, instant: new Date(`${dateStr}T${timeStr}:00-04:00`), date: new Date(`${dateStr}T00:00:00.000Z`) };
};

const clockInSession = async (userId, actorId, notes) => {
  const id = Number(userId); const now = boliviaDateTime();
  const boliviaDay = new Date(`${now.dateStr}T00:00:00.000Z`).getUTCDay();
  const user = await prisma.user.findUnique({where:{id},include:{scheduleBlocks:{where:{isActive:true,dayOfWeek:boliviaDay},orderBy:{blockOrder:'asc'}}}});
  if(!user||!user.isActive) throw new Error('El empleado seleccionado no existe');
  const open = await prisma.attendanceSession.findFirst({where:{userId:id,clockOut:null}}); if(open) throw new Error('El empleado ya tiene una entrada pendiente de salida');
  const sessions=await prisma.attendanceSession.findMany({where:{userId:id,workDate:now.date}});
  const available=user.scheduleBlocks.filter(block=>!sessions.some(session=>session.scheduleBlockId===block.id));
  const [nowHour,nowMinute]=now.timeStr.split(':').map(Number); const nowMinutes=nowHour*60+nowMinute;
  const block=[...available].reverse().find(candidate=>{const [hour,minute]=candidate.startTime.split(':').map(Number);return hour*60+minute<=nowMinutes;}) || available[0] || null;
  const scheduled=block?.startTime || user.scheduledEntryTime; const delay=calculateDelayMinutes(scheduled,now.timeStr);
  return prisma.$transaction(async tx=>{
    let attendance=await tx.attendance.findFirst({where:{userId:id,date:now.date}});
    if(!attendance) attendance=await tx.attendance.create({data:{userId:id,date:now.date,scheduledEntry:scheduled,actualEntry:now.timeStr,hoursWorked:0,delayMinutes:0,notes:notes||null,createdBy:actorId,updatedBy:actorId}});
    const session=await tx.attendanceSession.create({data:{userId:id,attendanceId:attendance.id,scheduleBlockId:block?.id||null,workDate:now.date,clockIn:now.instant,delayMinutes:delay,createdBy:actorId,updatedBy:actorId}});
    const aggregate=await tx.attendanceSession.aggregate({where:{attendanceId:attendance.id},_sum:{delayMinutes:true}});
    await tx.attendance.update({where:{id:attendance.id},data:{delayMinutes:aggregate._sum.delayMinutes||0,updatedBy:actorId}}); return session;
  });
};

const clockOutSession=async(id,actorId)=>{const current=await prisma.attendanceSession.findUnique({where:{id:Number(id)}});if(!current)throw new Error('Marcación no encontrada');if(current.clockOut)throw new Error('La salida ya fue registrada');const now=boliviaDateTime();if(now.instant<=current.clockIn)throw new Error('La salida debe ser posterior a la entrada');const worked=Math.round((now.instant-current.clockIn)/60000);return prisma.$transaction(async tx=>{const session=await tx.attendanceSession.update({where:{id:current.id},data:{clockOut:now.instant,workedMinutes:worked,updatedBy:actorId}});const agg=await tx.attendanceSession.aggregate({where:{attendanceId:current.attendanceId},_sum:{workedMinutes:true,delayMinutes:true}});await tx.attendance.update({where:{id:current.attendanceId},data:{actualExit:now.timeStr,hoursWorked:Number(((agg._sum.workedMinutes||0)/60).toFixed(2)),delayMinutes:agg._sum.delayMinutes||0,updatedBy:actorId}});return session})};

const justifySession = async (id, data, actorId) => {
  const session = await prisma.attendanceSession.findUnique({ where: { id: Number(id) } });
  if (!session) throw new Error('Marcación de asistencia no encontrada');
  if (session.delayMinutes <= 0) throw new Error('La marcación no tiene retraso para justificar');

  const now = new Date();
  return prisma.attendanceSession.update({
    where: { id: session.id },
    data: {
      justificationStatus: data.status,
      justificationReason: data.reason,
      justificationNotes: data.notes || null,
      justificationRequestedAt: session.justificationRequestedAt || now,
      justificationCreatedBy: session.justificationCreatedBy || actorId,
      justificationReviewedBy: actorId,
      justificationReviewedAt: now,
      decisionReason: data.decisionReason || data.reason,
      updatedBy: actorId,
    },
  });
};

/**
 * Create or update an attendance record (for Entry/notes).
 * Force current server time in Bolivia timezone for new entries.
 * For updates, only allow modifying notes (locked date and time).
 */
const upsert = async (data) => {
  const userId = parseInt(data.userId, 10);
  
  // Find employee to get scheduledEntryTime
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    throw new Error('El empleado seleccionado no existe');
  }

  let existing = null;
  let workDate;
  
  if (data.date) {
    const inputDate = new Date(data.date);
    const normalizedInputDate = new Date(Date.UTC(inputDate.getUTCFullYear(), inputDate.getUTCMonth(), inputDate.getUTCDate()));
    
    existing = await prisma.attendance.findFirst({
      where: {
        userId,
        date: normalizedInputDate,
      },
    });
    workDate = normalizedInputDate;
  }

  if (existing) {
    // UPDATE: Only allow updating the notes field. Date, entry/exit times, and delays are LOCKED.
    return prisma.attendance.update({
      where: { id: existing.id },
      data: {
        notes: data.notes !== undefined ? data.notes : existing.notes,
      },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            scheduledEntryTime: true,
          },
        },
      },
    });
  } else {
    // NEW REGISTRATION: Enforce current server time in Bolivia timezone (CLOCK IN)
    const { dateStr, timeStr } = getBoliviaTime();
    
    const scheduledEntry = user.scheduledEntryTime || '08:00';
    const actualEntry = timeStr;
    const delayMinutes = calculateDelayMinutes(scheduledEntry, actualEntry);
    
    const serverDate = new Date(dateStr);
    const normalizedServerDate = new Date(Date.UTC(serverDate.getFullYear(), serverDate.getMonth(), serverDate.getDate()));

    // Check again if we already have an entry for today (to prevent duplicates)
    const duplicateCheck = await prisma.attendance.findFirst({
      where: {
        userId,
        date: normalizedServerDate,
      },
    });

    if (duplicateCheck) {
      // If it exists, update notes only
      return prisma.attendance.update({
        where: { id: duplicateCheck.id },
        data: {
          notes: data.notes !== undefined ? data.notes : duplicateCheck.notes,
        },
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              scheduledEntryTime: true,
            },
          },
        },
      });
    }

    return prisma.attendance.create({
      data: {
        userId,
        date: normalizedServerDate,
        scheduledEntry,
        actualEntry,
        actualExit: null,
        hoursWorked: 0,
        delayMinutes,
        notes: data.notes || null,
      },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            scheduledEntryTime: true,
          },
        },
      },
    });
  }
};

/**
 * Get all attendance records with optional filtering.
 */
const getAll = async (filters) => {
  const where = {};

  if (filters.userId) {
    where.userId = parseInt(filters.userId, 10);
  }

  if (filters.month && filters.year) {
    const month = parseInt(filters.month, 10);
    const year = parseInt(filters.year, 10);
    
    const startDate = new Date(Date.UTC(year, month - 1, 1));
    const endDate = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));
    
    where.date = {
      gte: startDate,
      lte: endDate,
    };
  }

  const attendances = await prisma.attendance.findMany({
    where,
    include: { sessions: { orderBy: { clockIn: 'asc' } },
      user: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          employeeType: true,
          scheduledEntryTime: true,
        },
      },
    },
    orderBy: { date: 'desc' },
  });

  const reviewerIds = [...new Set(attendances
    .flatMap(attendance => attendance.sessions)
    .map(session => session.justificationReviewedBy)
    .filter(Boolean))];

  if (reviewerIds.length === 0) return attendances;

  const reviewers = await prisma.user.findMany({
    where: { id: { in: reviewerIds } },
    select: { id: true, firstName: true, lastName: true, email: true },
  });
  const reviewersById = new Map(reviewers.map(reviewer => [reviewer.id, reviewer]));

  return attendances.map(attendance => ({
    ...attendance,
    sessions: attendance.sessions.map(session => ({
      ...session,
      justificationReviewedByUser: reviewersById.get(session.justificationReviewedBy) || null,
    })),
  }));
};

/**
 * Get summary of delays and worked hours for a user in a given month.
 */
const getMonthlySummary = async (userId, month, year) => {
  const startDate = new Date(Date.UTC(year, month - 1, 1));
  const endDate = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));

  const attendances = await prisma.attendance.findMany({
    where: {
      userId: parseInt(userId, 10),
      date: {
        gte: startDate,
        lte: endDate,
      },
    },
  });

  const totalDelayMinutes = attendances.reduce((sum, att) => sum + att.delayMinutes, 0);
  const totalHoursWorked = attendances.reduce((sum, att) => sum + parseFloat(att.hoursWorked), 0);

  return {
    totalDelayMinutes,
    totalDelayHours: parseFloat((totalDelayMinutes / 60).toFixed(2)),
    totalHoursWorked: parseFloat(totalHoursWorked.toFixed(2)),
    daysAttended: attendances.length,
  };
};

module.exports = { 
  upsert, 
  getAll, 
  getMonthlySummary, 
  calculateDelayMinutes, 
  calculateWorkedHours, clockInSession, clockOutSession, justifySession
};
