"use strict";
const assert = require("node:assert/strict");
const test = require("node:test");
const D = require("../js/domain.js");
global.Domain = D;
const { MemoryStore, seed } = require("../js/storage.js");

function setup() {
  const store = new MemoryStore(seed);
  const clock = () => new Date("2026-10-30T08:00:00");
  return { store, service: new D.AppointmentService(store, clock) };
}

test("uygun zaman aralığında randevu oluşturur", () => {
  const { store, service } = setup();
  const item = service.create({ patientName: "Ayşe Demir", clinicId: "c1", serviceId: "s1", doctorId: "d1", date: "2026-11-02", time: "09:00" });
  assert.equal(item.status, D.AppointmentStatus.PENDING);
  assert.equal(item.fee, 750);
  assert.equal(store.getAppointments().length, 1);
});

test("doktorun uygun olmadığı saati reddeder", () => {
  const { service } = setup();
  assert.throws(() => service.create({ patientName: "Ayşe Demir", clinicId: "c1", serviceId: "s1", doctorId: "d1", date: "2026-11-02", time: "18:00" }), /uygun değil/);
});

test("çakışan randevuyu reddeder", () => {
  const { service } = setup();
  const request = { patientName: "Ayşe Demir", clinicId: "c1", serviceId: "s1", doctorId: "d1", date: "2026-11-02", time: "09:00" };
  service.create(request);
  assert.throws(() => service.create({ ...request, patientName: "Mehmet Can" }), /başka bir randevusu/);
});

test("iptal edilen kaydın saati yeniden kullanılabilir", () => {
  const { service } = setup();
  const request = { patientName: "Ayşe Demir", clinicId: "c1", serviceId: "s1", doctorId: "d1", date: "2026-11-02", time: "09:00" };
  const first = service.create(request);
  service.changeStatus(first.id, D.AppointmentStatus.CANCELLED);
  assert.doesNotThrow(() => service.create({ ...request, patientName: "Mehmet Can" }));
});

test("bekleyen randevuyu onaylar", () => {
  const { service } = setup();
  const item = service.create({ patientName: "Ayşe Demir", clinicId: "c1", serviceId: "s1", doctorId: "d1", date: "2026-11-02", time: "09:00" });
  service.changeStatus(item.id, D.AppointmentStatus.APPROVED);
  assert.equal(item.status, D.AppointmentStatus.APPROVED);
});

test("doktor uygunluğuna göre 15 dakikalık saat seçenekleri üretir", () => {
  const { service } = setup();
  const slots = service.getAvailableSlots({ clinicId: "c1", serviceId: "s1", doctorId: "d1", date: "2026-11-02" });
  assert.equal(slots[0], "09:00");
  assert.ok(slots.includes("11:30"));
  assert.ok(slots.includes("16:30"));
  assert.ok(!slots.includes("12:00"));
});

test("dolu zaman aralığıyla çakışan saat seçeneklerini listeden çıkarır", () => {
  const { service } = setup();
  service.create({ patientName: "Ayşe Demir", clinicId: "c1", serviceId: "s1", doctorId: "d1", date: "2026-11-02", time: "09:00" });
  const slots = service.getAvailableSlots({ clinicId: "c1", serviceId: "s1", doctorId: "d1", date: "2026-11-02" });
  assert.ok(!slots.includes("09:00"));
  assert.ok(!slots.includes("09:15"));
  assert.ok(slots.includes("09:30"));
});

test("geçmiş tarih için randevu oluşturmayı reddeder", () => {
  const { service } = setup();
  assert.throws(() => service.create({ patientName: "Ayşe Demir", clinicId: "c1", serviceId: "s1", doctorId: "d1", date: "2026-10-26", time: "09:00" }), /Geçmiş/);
});

test("geçmiş tarihte uygun saat döndürmez", () => {
  const { service } = setup();
  const slots = service.getAvailableSlots({ clinicId: "c1", serviceId: "s1", doctorId: "d1", date: "2026-10-26" });
  assert.deepEqual(slots, []);
});

test("hasta kendi adına kayıtlı randevuyu iptal eder", () => {
  const { service } = setup();
  const item = service.create({ patientName: "Ayşe Demir", clinicId: "c1", serviceId: "s1", doctorId: "d1", date: "2026-11-02", time: "09:00" });
  service.cancelForPatient(item.id, "  AYŞE DEMİR ");
  assert.equal(item.status, D.AppointmentStatus.CANCELLED);
});

test("hasta başka bir hastanın randevusunu iptal edemez", () => {
  const { service } = setup();
  const item = service.create({ patientName: "Ayşe Demir", clinicId: "c1", serviceId: "s1", doctorId: "d1", date: "2026-11-02", time: "09:00" });
  assert.throws(() => service.cancelForPatient(item.id, "Mehmet Can"), /yetkiniz yok/);
  assert.equal(item.status, D.AppointmentStatus.PENDING);
});
