(function (root) {
  "use strict";
  const D = root.Domain || (typeof require !== "undefined" ? require("./domain.js") : null);

  const seed = {
    clinics: [
      { id: "c1", name: "Merkez Sağlık Kliniği", address: "Serdivan, Sakarya", workingHours: "08:30 - 18:00", departments: ["Dahiliye", "Kardiyoloji"] },
      { id: "c2", name: "Kampüs Polikliniği", address: "Esentepe Kampüsü", workingHours: "09:00 - 17:00", departments: ["Genel Muayene", "Laboratuvar"] }
    ],
    services: [
      { id: "s1", clinicId: "c1", name: "Dahiliye Muayenesi", department: "Dahiliye", durationMinutes: 30, fee: 750 },
      { id: "s2", clinicId: "c1", name: "Kardiyoloji Kontrolü", department: "Kardiyoloji", durationMinutes: 45, fee: 1100 },
      { id: "s3", clinicId: "c2", name: "Genel Muayene", department: "Genel Muayene", durationMinutes: 30, fee: 600 },
      { id: "s4", clinicId: "c2", name: "Kan Tahlili", department: "Laboratuvar", durationMinutes: 15, fee: 350 }
    ],
    doctors: [
      { id: "d1", clinicId: "c1", name: "Dr. Elif Yılmaz", specialty: "İç Hastalıkları", serviceIds: ["s1"], availability: { "1": ["09:00-12:00", "13:00-17:00"], "3": ["09:00-12:00", "13:00-17:00"], "5": ["09:00-12:00"] } },
      { id: "d2", clinicId: "c1", name: "Dr. Kerem Aydın", specialty: "Kardiyoloji", serviceIds: ["s2"], availability: { "2": ["10:00-16:00"], "4": ["10:00-16:00"] } },
      { id: "d3", clinicId: "c2", name: "Dr. Selin Kaya", specialty: "Pratisyen Hekim", serviceIds: ["s3", "s4"], availability: { "1": ["09:00-17:00"], "2": ["09:00-17:00"], "3": ["09:00-17:00"], "4": ["09:00-17:00"], "5": ["09:00-17:00"] } }
    ],
    appointments: [], counters: { appointment: 0 }
  };

  class MemoryStore {
    constructor(data = seed) { this.loadData(data); }
    loadData(data) {
      const copy = JSON.parse(JSON.stringify(data));
      this.clinics = copy.clinics.map(x => new D.Clinic(x));
      this.services = copy.services.map(x => new D.HealthService(x));
      this.doctors = copy.doctors.map(x => new D.Doctor(x));
      this.appointments = copy.appointments.map(x => new D.Appointment(x));
      this.counters = copy.counters || { appointment: this.appointments.length };
    }
    getClinics() { return [...this.clinics]; }
    getClinic(id) { return this.clinics.find(x => x.id === id); }
    getServices() { return [...this.services]; }
    getService(id) { return this.services.find(x => x.id === id); }
    getDoctors() { return [...this.doctors]; }
    getDoctor(id) { return this.doctors.find(x => x.id === id); }
    getAppointments() { return [...this.appointments]; }
    getAppointment(id) { return this.appointments.find(x => x.id === id); }
    nextId(type) { this.counters[type] = (this.counters[type] || 0) + 1; return `${type}-${this.counters[type]}`; }
    saveAppointment(value) { this.appointments.push(value); this.persist(); }
    updateAppointment() { this.persist(); }
    persist() {}
  }

  class LocalStorageStore extends MemoryStore {
    constructor(key = "health-appointment-system") {
      const saved = localStorage.getItem(key);
      super(saved ? JSON.parse(saved) : seed);
      this.key = key;
      if (!saved) this.persist();
    }
    persist() {
      if (!this.key) return;
      localStorage.setItem(this.key, JSON.stringify({ clinics: this.clinics, services: this.services, doctors: this.doctors, appointments: this.appointments, counters: this.counters }));
    }
    reset() { localStorage.removeItem(this.key); this.loadData(seed); this.persist(); }
  }

  const exported = { seed, MemoryStore, LocalStorageStore };
  root.StorageLayer = exported;
  if (typeof module !== "undefined" && module.exports) module.exports = exported;
})(typeof window !== "undefined" ? window : globalThis);
