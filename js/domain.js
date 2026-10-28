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
    constructor(store) {
      this.store = store;
    }

    create({ patientName, clinicId, serviceId, doctorId, date, time }) {
      const service = this.store.getService(serviceId);
      const doctor = this.store.getDoctor(doctorId);
      const clinic = this.store.getClinic(clinicId);
      if (!patientName || !service || !doctor || !clinic) throw new Error("Tüm randevu bilgileri eksiksiz seçilmelidir.");
      if (service.clinicId !== clinicId || doctor.clinicId !== clinicId || !doctor.canProvide(serviceId)) {
        throw new Error("Seçilen doktor bu hizmeti ilgili klinikte sunmuyor.");
      }
      const start = new Date(`${date}T${time}:00`);
      if (Number.isNaN(start.getTime())) throw new Error("Geçerli bir tarih ve saat seçin.");
      if (!doctor.isAvailable(start, service.durationMinutes)) throw new Error("Doktor seçilen zaman aralığında uygun değil.");
      const conflict = this.store.getAppointments().some(item =>
        item.doctorId === doctorId && item.overlaps(start, service.durationMinutes)
      );
      if (conflict) throw new Error("Bu zaman aralığında doktorun başka bir randevusu var.");

      const appointment = new Appointment({
        id: this.store.nextId("appointment"), patientName: patientName.trim(), clinicId, serviceId, doctorId,
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
  }

  const exported = { AppointmentStatus, Clinic, HealthService, Employee, Doctor, Appointment, AppointmentService };
  root.Domain = exported;
  if (typeof module !== "undefined" && module.exports) module.exports = exported;
})(typeof window !== "undefined" ? window : globalThis);
