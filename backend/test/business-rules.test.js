const test=require('node:test');const assert=require('node:assert/strict');
const { validateBlocks } = require('../src/services/schedule.service');
const { durationHours, overtimeAmount } = require('../src/services/workforce.service');
const { calculateDelayMinutes } = require('../src/services/attendance.service');
test('acepta jornada partida',()=>assert.equal(validateBlocks([{dayOfWeek:1,startTime:'08:00',endTime:'12:00'},{dayOfWeek:1,startTime:'14:00',endTime:'18:00'}]).length,2));
test('rechaza bloques solapados',()=>assert.throws(()=>validateBlocks([{dayOfWeek:1,startTime:'08:00',endTime:'12:00'},{dayOfWeek:1,startTime:'11:00',endTime:'14:00'}]),/solapados/));
test('contempla bloque nocturno',()=>{const [b]=validateBlocks([{dayOfWeek:5,startTime:'21:00',endTime:'00:00'}]);assert.equal(b.crossesMidnight,true);assert.equal(durationHours('21:00','00:00'),3)});
test('calcula retraso sin afectar llegada anticipada',()=>{assert.equal(calculateDelayMinutes('08:00','08:10'),10);assert.equal(calculateDelayMinutes('08:00','07:55'),0)});
test('calcula horas extra con multiplicador y monto fijo',()=>{const user={hourlyRate:20};assert.equal(overtimeAmount(user,{paymentMode:'MULTIPLIER',multiplier:1.5},2),60);assert.equal(overtimeAmount(user,{paymentMode:'FIXED_AMOUNT',fixedAmount:75},2),75)});
