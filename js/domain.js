(function (root) {
  "use strict";

  const AppointmentStatus = Object.freeze({
    PENDING: "PENDING",
    APPROVED: "APPROVED",
    CANCELLED: "CANCELLED"
  });

  class Clinic {
    constructor({ id, name, address, workingHours, departments = [] }) {
      if (!id || !name) throw new Error("Klinik kimliği ve adı zorunludur.");
      this.id = id;
      this.name = name;
      this.address = address;
      this.workingHours = workingHours;
      this.departments = departments;
    }
  }

  class HealthService {
    constructor({ id, clinicId, name, department, durationMinutes, fee }) {
      if (durationMinutes <= 0 || fee < 0) throw new Error("Hizmet süresi ve ücreti geçerli olmalıdır.");
      Object.assign(this, { id, clinicId, name, department, durationMinutes, fee });
    }
  }

  class Employee {
    constructor({ id, clinicId, name, role, serviceIds = [] }) {
      Object.assign(this, { id, clinicId, name, role, serviceIds });
    }

    canProvide(serviceId) {
      return this.serviceIds.includes(serviceId);
    }
  }

  class Doctor extends Employee {
    constructor(data) {
      super({ ...data, role: "DOCTOR" });
      this.specialty = data.specialty;
      this.availability = data.availability || {};
    }

    isAvailable(start, durationMinutes) {
      const day = String(start.getDay());
      const ranges = this.availability[day] || [];
      const startMinute = start.getHours() * 60 + start.getMinutes();
      const endMinute = startMinute + durationMinutes;
      return ranges.some(range => {
        const [from, to] = range.split("-").map(Doctor.toMinute);
        return startMinute >= from && endMinute <= to;
      });
    }

    static toMinute(value) {
      const [hour, minute] = value.split(":").map(Number);
      return hour * 60 + minute;
    }
  }

  class Appointment {
    constructor({ id, patientName, clinicId, serviceId, doctorId, start, durationMinutes, fee, status = AppointmentStatus.PENDING, createdAt }) {
      Object.assign(this, { id, patientName, clinicId, serviceId, doctorId, start, durationMinutes, fee, status, createdAt });
    }

    get endTime() {
      return new Date(new Date(this.start).getTime() + this.durationMinutes * 60000);
    }

    overlaps(start, durationMinutes) {
      if (this.status === AppointmentStatus.CANCELLED) return false;
      const ownStart = new Date(this.start);
      const requestedEnd = new Date(start.getTime() + durationMinutes * 60000);
      return ownStart < requestedEnd && start < this.endTime;
    }

    approve() {
      if (this.status !== AppointmentStatus.PENDING) throw new Error("Yalnızca bekleyen randevular onaylanabilir.");
      this.status = AppointmentStatus.APPROVED;
    }

    cancel() {
      if (this.status === AppointmentStatus.CANCELLED) throw new Error("Randevu zaten iptal edilmiş.");
      this.status = AppointmentStatus.CANCELLED;
    }
  }

  class AppointmentService {
    constructor(store, clock = () => new Date()) {
      this.store = store;
      this.clock = clock;
    }

    getAvailableSlots({ clinicId, serviceId, doctorId, date }) {
      const { service, doctor } = this.resolveSelection(clinicId, serviceId, doctorId);
      const selectedDate = new Date(`${date}T00:00:00`);
      if (!date || Number.isNaN(selectedDate.getTime())) throw new Error("Geçerli bir tarih seçin.");

      const ranges = doctor.availability[String(selectedDate.getDay())] || [];
      const now = new Date(this.clock());
      const slots = [];

      ranges.forEach(range => {
        const [from, to] = range.split("-").map(Doctor.toMinute);
        for (let minute = from; minute + service.durationMinutes <= to; minute += 15) {
          const time = AppointmentService.formatMinute(minute);
          const start = new Date(`${date}T${time}:00`);
          if (start <= now || this.hasConflict(doctorId, start, service.durationMinutes)) continue;
          slots.push(time);
        }
      });

      return slots;
    }

    resolveSelection(clinicId, serviceId, doctorId) {
      const service = this.store.getService(serviceId);
      const doctor = this.store.getDoctor(doctorId);
      const clinic = this.store.getClinic(clinicId);
      if (!service || !doctor || !clinic) throw new Error("Klinik, hizmet ve doktor eksiksiz seçilmelidir.");
      if (service.clinicId !== clinicId || doctor.clinicId !== clinicId || !doctor.canProvide(serviceId)) {
        throw new Error("Seçilen doktor bu hizmeti ilgili klinikte sunmuyor.");
      }
      return { service, doctor, clinic };
    }

    hasConflict(doctorId, start, durationMinutes) {
      return this.store.getAppointments().some(item =>
        item.doctorId === doctorId && item.overlaps(start, durationMinutes)
      );
    }

    static formatMinute(total) {
      const hour = String(Math.floor(total / 60)).padStart(2, "0");
      const minute = String(total % 60).padStart(2, "0");
      return `${hour}:${minute}`;
    }

    create({ patientName, clinicId, serviceId, doctorId, date, time }) {
      const normalizedPatientName = patientName ? patientName.trim() : "";
      if (normalizedPatientName.length < 3) throw new Error("Hasta adı en az 3 karakter olmalıdır.");
      const { service, doctor } = this.resolveSelection(clinicId, serviceId, doctorId);
      const start = new Date(`${date}T${time}:00`);
      if (Number.isNaN(start.getTime())) throw new Error("Geçerli bir tarih ve saat seçin.");
      if (start <= new Date(this.clock())) throw new Error("Geçmiş bir tarih veya saat için randevu oluşturulamaz.");
      if (!doctor.isAvailable(start, service.durationMinutes)) throw new Error("Doktor seçilen zaman aralığında uygun değil.");
      if (this.hasConflict(doctorId, start, service.durationMinutes)) throw new Error("Bu zaman aralığında doktorun başka bir randevusu var.");

      const appointment = new Appointment({
        id: this.store.nextId("appointment"), patientName: normalizedPatientName, clinicId, serviceId, doctorId,
        start: start.toISOString(), durationMinutes: service.durationMinutes, fee: service.fee,
        createdAt: new Date().toISOString()
      });
      this.store.saveAppointment(appointment);
      return appointment;
    }

    changeStatus(id, status) {
      const appointment = this.store.getAppointment(id);
      if (!appointment) throw new Error("Randevu bulunamadı.");
      if (status === AppointmentStatus.APPROVED) appointment.approve();
      else if (status === AppointmentStatus.CANCELLED) appointment.cancel();
      else throw new Error("Desteklenmeyen randevu durumu.");
      this.store.updateAppointment(appointment);
      return appointment;
    }

    cancelForPatient(id, patientName) {
      const appointment = this.store.getAppointment(id);
      if (!appointment) throw new Error("Randevu bulunamadı.");
      const requestedName = AppointmentService.normalizeName(patientName);
      const ownerName = AppointmentService.normalizeName(appointment.patientName);
      if (!requestedName || requestedName !== ownerName) {
        throw new Error("Bu randevuyu iptal etme yetkiniz yok.");
      }
      appointment.cancel();
      this.store.updateAppointment(appointment);
      return appointment;
    }

    static normalizeName(value) {
      return String(value || "").trim().toLocaleLowerCase("tr-TR");
    }
  }

  const exported = { AppointmentStatus, Clinic, HealthService, Employee, Doctor, Appointment, AppointmentService };
  root.Domain = exported;
  if (typeof module !== "undefined" && module.exports) module.exports = exported;
})(typeof window !== "undefined" ? window : globalThis);
