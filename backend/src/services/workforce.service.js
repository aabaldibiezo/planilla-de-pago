const prisma = require('../lib/prisma');
const { minutes } = require('./schedule.service');

const dateOnly = value => value instanceof Date
  ? new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()))
  : new Date(`${String(value).slice(0,10)}T00:00:00.000Z`);
const durationHours = (start, end) => {
  if (start === end) throw new Error('La hora de inicio y fin no pueden ser iguales');
  let diff = minutes(end) - minutes(start); if (diff < 0) diff += 1440;
  return Number((diff / 60).toFixed(2));
};
const overtimeAmount = (user, input, hours) => {
  const rate = Number(user.hourlyRate); const multiplier = Number(input.multiplier ?? 1);
  if (!Number.isFinite(multiplier) || multiplier <= 0) throw new Error('El multiplicador debe ser mayor a cero');
  if (input.paymentMode === 'LOWER_RATE' && multiplier >= 1) throw new Error('La tarifa reducida requiere un multiplicador menor a 1');
  if (input.paymentMode === 'HIGHER_RATE' && multiplier <= 1) throw new Error('La tarifa incrementada requiere un multiplicador mayor a 1');
  if (input.paymentMode === 'SAME_RATE' && multiplier !== 1) throw new Error('La tarifa normal debe usar multiplicador 1');
  if (input.paymentMode === 'FIXED_AMOUNT') {
    const fixed = Number(input.fixedAmount);
    if (!Number.isFinite(fixed) || fixed <= 0) throw new Error('El monto fijo debe ser mayor a cero');
    return fixed;
  }
  if (['TIME_OFF','UNPAID'].includes(input.paymentMode)) return 0;
  return Number((hours * rate * multiplier).toFixed(2));
};

const interval = (start, end) => {
  const startMinutes = minutes(start);
  let endMinutes = minutes(end);
  if (endMinutes <= startMinutes) endMinutes += 1440;
  return [startMinutes, endMinutes];
};
const overlaps = (left, right) => left[0] < right[1] && right[0] < left[1];
const assertNoConflict = async (tx, input, excludeId) => {
  const userId = Number(input.userId);
  const workDate = dateOnly(input.workDate);
  const candidate = interval(input.startTime, input.endTime);
  const existing = await tx.overtime.findMany({ where: { userId, workDate, status: { notIn: ['REJECTED', 'CANCELLED'] }, ...(excludeId && { id: { not: Number(excludeId) } }) } });
  if (existing.some(row => overlaps(candidate, interval(row.startTime, row.endTime)))) throw new Error('La hora extra se solapa con otro registro activo del empleado');
  const blocks = await tx.scheduleBlock.findMany({ where: { userId, dayOfWeek: workDate.getUTCDay(), isActive: true } });
  if (blocks.some(block => overlaps(candidate, interval(block.startTime, block.endTime)))) throw new Error('La hora extra se solapa con el horario ordinario del empleado');
};

const createOvertime = async (input, actorId) => {
  const user = await prisma.user.findUnique({ where:{ id:Number(input.userId) } });
  if (!user || !user.isActive || user.role !== 'EMPLOYEE') throw new Error('Empleado no encontrado o inactivo');
  const hours = durationHours(input.startTime,input.endTime);
  const amount = overtimeAmount(user,input,hours);
  return prisma.$transaction(async tx => {
    await assertNoConflict(tx, { ...input, userId: user.id });
    const overtime = await tx.overtime.create({ data:{ userId:user.id, workDate:dateOnly(input.workDate), startTime:input.startTime,endTime:input.endTime,hours,reason:input.reason,status:'PENDING',paymentMode:input.paymentMode,hourlyRateSnapshot:user.hourlyRate,multiplier:Number(input.multiplier??1),fixedAmount:input.fixedAmount == null ? null : Number(input.fixedAmount),calculatedAmount:amount,notes:input.notes||null,requestedBy:actorId } });
    return overtime;
  });
};

const approveOvertime = (id,status,actorId) => prisma.$transaction(async tx => {
  const current=await tx.overtime.findUnique({where:{id:Number(id)}}); if(!current) throw new Error('Hora extra no encontrada');
  if(current.status!=='PENDING') throw new Error('Solo se puede decidir una hora extra pendiente');
  const row=await tx.overtime.update({where:{id:current.id},data:{status,approvedBy:actorId,approvedAt:new Date()}});
  if(status==='APPROVED'&&row.paymentMode==='TIME_OFF'&&!await tx.timeCompensation.findFirst({where:{overtimeId:row.id}})) await tx.timeCompensation.create({data:{userId:row.userId,overtimeId:row.id,generatedHours:row.hours,remainingHours:row.hours,generatedAt:new Date(),reason:row.reason,authorizedBy:actorId,notes:row.notes}});
  return row;
});

const updateOvertime = async (id, input, actorId) => prisma.$transaction(async tx => {
  const current = await tx.overtime.findUnique({ where: { id: Number(id) } });
  if (!current) throw new Error('Hora extra no encontrada');
  if (current.status !== 'PENDING') throw new Error('Solo se pueden editar horas extra pendientes');
  const userId = input.userId == null ? current.userId : Number(input.userId);
  const user = await tx.user.findUnique({ where: { id: userId } });
  if (!user || !user.isActive || user.role !== 'EMPLOYEE') throw new Error('Empleado no encontrado o inactivo');
  const startTime = input.startTime || current.startTime;
  const endTime = input.endTime || current.endTime;
  const paymentMode = input.paymentMode || current.paymentMode;
  const hours = durationHours(startTime, endTime);
  const amount = overtimeAmount(user, { paymentMode, multiplier: input.multiplier ?? current.multiplier, fixedAmount: input.fixedAmount ?? current.fixedAmount }, hours);
  await assertNoConflict(tx, { userId, workDate: input.workDate || current.workDate, startTime, endTime }, current.id);
  return tx.overtime.update({ where: { id: current.id }, data: { userId, workDate: input.workDate ? dateOnly(input.workDate) : current.workDate, startTime, endTime, hours, reason: input.reason || current.reason, paymentMode, multiplier: input.multiplier == null ? current.multiplier : Number(input.multiplier), fixedAmount: input.fixedAmount === undefined ? current.fixedAmount : (input.fixedAmount == null ? null : Number(input.fixedAmount)), hourlyRateSnapshot: user.hourlyRate, calculatedAmount: amount, notes: input.notes === undefined ? current.notes : (input.notes || null) } });
});

const removeOvertime = async id => {
  const current = await prisma.overtime.findUnique({ where: { id: Number(id) } });
  if (!current) throw new Error('Hora extra no encontrada');
  if (current.status !== 'PENDING') throw new Error('Solo se pueden eliminar horas extra pendientes');
  await prisma.overtime.delete({ where: { id: current.id } });
  return current;
};

const createDiscount=async(input,actorId)=>{const user=await prisma.user.findUnique({where:{id:Number(input.userId)}});if(!user||!user.isActive||user.role!=='EMPLOYEE')throw new Error('Empleado no encontrado o inactivo');if(input.type==='UNJUSTIFIED_DELAY')throw new Error('Los retrasos se descuentan automáticamente y no deben duplicarse manualmente');return prisma.discount.create({data:{userId:user.id,type:input.type,amount:Number(input.amount),discountDate:dateOnly(input.discountDate),description:input.description,status:'PENDING',createdBy:actorId,notes:input.notes||null,documentReference:input.documentReference||null}})};
const approveDiscount=(id,status,actorId)=>prisma.$transaction(async tx=>{const current=await tx.discount.findUnique({where:{id:Number(id)}});if(!current)throw new Error('Descuento no encontrado');if(current.status!=='PENDING'||current.paymentId)throw new Error('Solo se puede decidir un descuento pendiente y no aplicado');return tx.discount.update({where:{id:current.id},data:{status,approvedBy:actorId,approvedAt:new Date()}})});
const useCompensation=(id,hours,actorId,notes)=>prisma.$transaction(async tx=>{const row=await tx.timeCompensation.findUnique({where:{id:Number(id)}});if(!row)throw new Error('Compensación no encontrada');if(!['AVAILABLE','PARTIALLY_USED'].includes(row.status))throw new Error('La compensación ya no está disponible');const use=Number(hours),remaining=Number(row.remainingHours);if(!Number.isFinite(use)||use<=0||use>remaining)throw new Error('No puede utilizar más horas que el saldo disponible');const newRemaining=Number((remaining-use).toFixed(2));return tx.timeCompensation.update({where:{id:row.id},data:{usedHours:Number((Number(row.usedHours)+use).toFixed(2)),remainingHours:newRemaining,usedAt:new Date(),authorizedBy:actorId,notes:notes||row.notes,status:newRemaining===0?'USED':'PARTIALLY_USED'}})});
const list=async(model,filters={})=>{const where={};if(filters.userId)where.userId=Number(filters.userId);if(filters.status)where.status=filters.status;const rows=await prisma[model].findMany({where,orderBy:{createdAt:'desc'},include:{user:{select:{id:true,firstName:true,lastName:true,email:true}},...(model==='overtime'&&{paymentDetails:{select:{paymentId:true}}})}});if(model!=='overtime')return rows;const ids=[...new Set(rows.map(row=>row.approvedBy).filter(Boolean))];const approvers=ids.length?await prisma.user.findMany({where:{id:{in:ids}},select:{id:true,firstName:true,lastName:true,email:true}}):[];const byId=new Map(approvers.map(user=>[user.id,user]));return rows.map(row=>({...row,approvedByUser:byId.get(row.approvedBy)||null,paymentId:row.paymentDetails[0]?.paymentId||null}));};
module.exports={createOvertime,updateOvertime,removeOvertime,approveOvertime,createDiscount,approveDiscount,useCompensation,list,durationHours,overtimeAmount};
