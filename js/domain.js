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
    constructor({ id, patientName, clinicId, serviceId, doctorId, start, durationMinutes, fee, status = AppointmentStatus.PENDING, createdAt, history = [] }) {
      Object.assign(this, { id, patientName, clinicId, serviceId, doctorId, start, durationMinutes, fee, status, createdAt, history });
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

    approve(actor = "ADMIN", at = new Date().toISOString()) {
      if (this.status !== AppointmentStatus.PENDING) throw new Error("Yalnızca bekleyen randevular onaylanabilir.");
      this.status = AppointmentStatus.APPROVED;
      this.addHistory(AppointmentStatus.APPROVED, actor, at);
    }

    cancel(actor = "ADMIN", at = new Date().toISOString()) {
      if (this.status === AppointmentStatus.CANCELLED) throw new Error("Randevu zaten iptal edilmiş.");
      this.status = AppointmentStatus.CANCELLED;
      this.addHistory(AppointmentStatus.CANCELLED, actor, at);
    }

    addHistory(action, actor, at) {
      this.history.push({ action, actor, at });
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
        createdAt: new Date(this.clock()).toISOString(),
        history: [{ action: "CREATED", actor: "PATIENT", at: new Date(this.clock()).toISOString() }]
      });
      this.store.saveAppointment(appointment);
      return appointment;
    }

    changeStatus(id, status, actor = "ADMIN") {
      const appointment = this.store.getAppointment(id);
      if (!appointment) throw new Error("Randevu bulunamadı.");
      const at = new Date(this.clock()).toISOString();
      if (status === AppointmentStatus.APPROVED) appointment.approve(actor, at);
      else if (status === AppointmentStatus.CANCELLED) appointment.cancel(actor, at);
      else throw new Error("Desteklenmeyen randevu durumu.");
      this.store.updateAppointment(appointment);
      return appointment;
    }

    changeStatusForDoctor(id, status, doctorId) {
      const appointment = this.store.getAppointment(id);
      const doctor = this.store.getDoctor(doctorId);
      if (!appointment) throw new Error("Randevu bulunamadı.");
      if (!doctor || appointment.doctorId !== doctor.id) {
        throw new Error("Bu randevunun durumunu değiştirme yetkiniz yok.");
      }
      return this.changeStatus(id, status, "DOCTOR");
    }

    cancelForPatient(id, patientName) {
      const appointment = this.store.getAppointment(id);
      if (!appointment) throw new Error("Randevu bulunamadı.");
      const requestedName = AppointmentService.normalizeName(patientName);
      const ownerName = AppointmentService.normalizeName(appointment.patientName);
      if (!requestedName || requestedName !== ownerName) {
        throw new Error("Bu randevuyu iptal etme yetkiniz yok.");
      }
      appointment.cancel("PATIENT", new Date(this.clock()).toISOString());
      this.store.updateAppointment(appointment);
      return appointment;
    }

    static normalizeName(value) {
      return String(value || "").trim().toLocaleLowerCase("tr-TR");
    }
  }

  class ClinicManagementService {
    constructor(store) {
      this.store = store;
    }

    addClinic({ name, address, workingHours, departments }) {
      const normalizedName = String(name || "").trim();
      const normalizedAddress = String(address || "").trim();
      const normalizedHours = String(workingHours || "").trim();
      const normalizedDepartments = (Array.isArray(departments) ? departments : String(departments || "").split(","))
        .map(value => String(value).trim())
        .filter(Boolean);
      if (!normalizedName || !normalizedAddress || !normalizedHours || !normalizedDepartments.length) {
        throw new Error("Klinik adı, adresi, çalışma saatleri ve en az bir bölüm zorunludur.");
      }
      const clinic = new Clinic({
        id: this.store.nextId("clinic"), name: normalizedName, address: normalizedAddress,
        workingHours: normalizedHours, departments: normalizedDepartments
      });
      this.store.saveClinic(clinic);
      return clinic;
    }

    addService({ clinicId, name, department, durationMinutes, fee }) {
      const normalizedName = String(name || "").trim();
      const normalizedDepartment = String(department || "").trim();
      const duration = Number(durationMinutes);
      const serviceFee = Number(fee);
      if (!this.store.getClinic(clinicId)) throw new Error("Hizmet için geçerli bir klinik seçin.");
      if (!normalizedName || !normalizedDepartment) throw new Error("Hizmet adı ve bölümü zorunludur.");
      if (!Number.isFinite(duration) || !Number.isFinite(serviceFee)) throw new Error("Hizmet süresi ve ücreti sayı olmalıdır.");
      const service = new HealthService({
        id: this.store.nextId("service"), clinicId, name: normalizedName, department: normalizedDepartment,
        durationMinutes: duration, fee: serviceFee
      });
      this.store.saveService(service);
      return service;
    }

    addDoctor({ clinicId, name, specialty, serviceIds, availability }) {
      const normalizedName = String(name || "").trim();
      const normalizedSpecialty = String(specialty || "").trim();
      const normalizedServiceIds = [...new Set(Array.isArray(serviceIds) ? serviceIds : [])];
      if (!this.store.getClinic(clinicId)) throw new Error("Doktor için geçerli bir klinik seçin.");
      if (!normalizedName || !normalizedSpecialty) throw new Error("Doktor adı ve uzmanlığı zorunludur.");
      if (!normalizedServiceIds.length) throw new Error("Doktorun sunduğu en az bir hizmet seçin.");
      const hasInvalidService = normalizedServiceIds.some(id => {
        const service = this.store.getService(id);
        return !service || service.clinicId !== clinicId;
      });
      if (hasInvalidService) throw new Error("Seçilen hizmetlerin tamamı aynı kliniğe ait olmalıdır.");
      const normalizedAvailability = ClinicManagementService.normalizeAvailability(availability);
      const doctor = new Doctor({
        id: this.store.nextId("doctor"), clinicId, name: normalizedName, specialty: normalizedSpecialty,
        serviceIds: normalizedServiceIds, availability: normalizedAvailability
      });
      this.store.saveDoctor(doctor);
      return doctor;
    }

    static normalizeAvailability(value) {
      if (value && typeof value === "object" && !Array.isArray(value)) return value;
      const availability = {};
      const entries = String(value || "").split(";").map(entry => entry.trim()).filter(Boolean);
      entries.forEach(entry => {
        const separator = entry.indexOf(":");
        const day = entry.slice(0, separator).trim();
        const ranges = entry.slice(separator + 1).split(",").map(range => range.trim()).filter(Boolean);
        if (!/^[0-6]$/.test(day) || !ranges.length) throw new Error("Uygunluk günleri 0-6 ve saat aralıklarıyla tanımlanmalıdır.");
        ranges.forEach(range => {
          if (!/^\d{2}:\d{2}-\d{2}:\d{2}$/.test(range)) throw new Error("Saat aralıklarını 09:00-17:00 biçiminde girin.");
          const [from, to] = range.split("-").map(Doctor.toMinute);
          if (from >= to || from < 0 || to > 24 * 60) throw new Error("Uygunluk saat aralığı geçerli olmalıdır.");
        });
        availability[day] = [...(availability[day] || []), ...ranges];
      });
      if (!entries.length) throw new Error("Doktor için en az bir uygunluk günü tanımlayın.");
      return availability;
    }
  }

  const exported = { AppointmentStatus, Clinic, HealthService, Employee, Doctor, Appointment, AppointmentService, ClinicManagementService };
  root.Domain = exported;
  if (typeof module !== "undefined" && module.exports) module.exports = exported;
})(typeof window !== "undefined" ? window : globalThis);
