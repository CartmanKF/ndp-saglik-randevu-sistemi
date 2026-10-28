(function () {
  "use strict";
  const D = window.Domain;
  const store = new window.StorageLayer.LocalStorageStore();
  const appointments = new D.AppointmentService(store);
  const $ = id => document.getElementById(id);
  const statusLabel = { PENDING: "Onay bekliyor", APPROVED: "Onaylandı", CANCELLED: "İptal edildi" };

  function option(value, label) { return `<option value="${value}">${label}</option>`; }
  function formatMoney(value) { return new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 0 }).format(value); }
  function formatDate(value) { return new Intl.DateTimeFormat("tr-TR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)); }
  function showMessage(text, kind = "success") { $("formMessage").textContent = text; $("formMessage").className = `message ${kind}`; }

  function renderRole() {
    const role = $("roleSelect").value;
    document.querySelectorAll(".patient-only").forEach(el => el.classList.toggle("hidden", role !== "patient"));
    document.querySelectorAll(".admin-only").forEach(el => el.classList.toggle("hidden", role !== "admin"));
    const texts = {
      patient: ["Randevularınızı kolayca yönetin", "Uygun doktoru ve hizmeti seçip yeni bir randevu oluşturabilirsiniz."],
      doctor: ["Günlük randevu akışını takip edin", "Bekleyen randevuları onaylayabilir veya uygun olmayan kayıtları iptal edebilirsiniz."],
      admin: ["Klinik operasyonunu tek ekrandan izleyin", "Kurumları, hizmetleri, çalışanları ve randevu durumlarını görüntüleyebilirsiniz."]
    };
    [$("welcomeTitle").textContent, $("welcomeText").textContent] = texts[role];
    renderAppointments();
  }

  function renderStats() {
    const all = store.getAppointments();
    const data = [
      [store.getClinics().length, "Aktif klinik"],
      [store.getDoctors().length, "Kayıtlı doktor"],
      [all.filter(x => x.status === D.AppointmentStatus.PENDING).length, "Onay bekleyen"],
      [all.filter(x => x.status === D.AppointmentStatus.APPROVED).length, "Onaylı randevu"]
    ];
    $("stats").innerHTML = data.map(([value, label]) => `<div class="stat"><strong>${value}</strong><span>${label}</span></div>`).join("");
  }

  function renderSelects() {
    $("clinicSelect").innerHTML = `<option value="">Klinik seçin</option>` + store.getClinics().map(x => option(x.id, x.name)).join("");
    syncServices();
  }

  function syncServices() {
    const clinicId = $("clinicSelect").value;
    const list = store.getServices().filter(x => x.clinicId === clinicId);
    $("serviceSelect").innerHTML = `<option value="">Hizmet seçin</option>` + list.map(x => option(x.id, `${x.name} · ${x.durationMinutes} dk · ${formatMoney(x.fee)}`)).join("");
    syncDoctors();
  }

  function syncDoctors() {
    const clinicId = $("clinicSelect").value;
    const serviceId = $("serviceSelect").value;
    const list = store.getDoctors().filter(x => x.clinicId === clinicId && (!serviceId || x.canProvide(serviceId)));
    $("doctorSelect").innerHTML = `<option value="">Doktor seçin</option>` + list.map(x => option(x.id, `${x.name} · ${x.specialty}`)).join("");
  }

  function renderAppointments() {
    const role = $("roleSelect").value;
    const filter = $("statusFilter").value;
    const list = store.getAppointments()
      .filter(x => filter === "ALL" || x.status === filter)
      .sort((a, b) => new Date(a.start) - new Date(b.start));
    if (!list.length) {
      $("appointmentList").innerHTML = $("emptyTemplate").innerHTML;
      return;
    }
    $("appointmentList").innerHTML = list.map(item => {
      const clinic = store.getClinic(item.clinicId);
      const service = store.getService(item.serviceId);
      const doctor = store.getDoctor(item.doctorId);
      const canManage = role !== "patient" && item.status === D.AppointmentStatus.PENDING;
      return `<article class="appointment">
        <div><h3>${item.patientName}</h3><p>${service.name} · ${formatMoney(item.fee)}</p></div>
        <div><strong>${doctor.name}</strong><p>${clinic.name}</p></div>
        <div><span class="badge ${item.status}">${statusLabel[item.status]}</span><p>${formatDate(item.start)} · ${item.durationMinutes} dk</p></div>
        <div class="actions">${canManage ? `<button class="approve" data-action="APPROVED" data-id="${item.id}">Onayla</button><button class="cancel" data-action="CANCELLED" data-id="${item.id}">İptal</button>` : ""}</div>
      </article>`;
    }).join("");
  }

  function renderAdminData() {
    $("clinicList").innerHTML = store.getClinics().map(clinic => {
      const services = store.getServices().filter(x => x.clinicId === clinic.id);
      return `<article class="card"><h3>${clinic.name}</h3><p>${clinic.address} · ${clinic.workingHours}</p><div class="chips">${services.map(x => `<span class="chip">${x.name} · ${x.durationMinutes} dk</span>`).join("")}</div></article>`;
    }).join("");
    $("doctorList").innerHTML = store.getDoctors().map(doctor => {
      const clinic = store.getClinic(doctor.clinicId);
      const days = Object.values(doctor.availability).flat().join(", ");
      return `<article class="card"><h3>${doctor.name}</h3><p>${doctor.specialty} · ${clinic.name}</p><div class="chips"><span class="chip">${days}</span>${doctor.serviceIds.map(id => `<span class="chip">${store.getService(id).name}</span>`).join("")}</div></article>`;
    }).join("");
  }

  $("appointmentForm").addEventListener("submit", event => {
    event.preventDefault();
    try {
      appointments.create({ patientName: $("patientName").value, clinicId: $("clinicSelect").value, serviceId: $("serviceSelect").value, doctorId: $("doctorSelect").value, date: $("dateInput").value, time: $("timeInput").value });
      showMessage("Randevu oluşturuldu ve onaya gönderildi.");
      event.target.reset();
      renderSelects();
      renderStats();
      renderAppointments();
    } catch (error) { showMessage(error.message, "error"); }
  });

  $("appointmentList").addEventListener("click", event => {
    const button = event.target.closest("button[data-action]");
    if (!button) return;
    try { appointments.changeStatus(button.dataset.id, button.dataset.action); renderStats(); renderAppointments(); }
    catch (error) { alert(error.message); }
  });
  $("roleSelect").addEventListener("change", renderRole);
  $("statusFilter").addEventListener("change", renderAppointments);
  $("clinicSelect").addEventListener("change", syncServices);
  $("serviceSelect").addEventListener("change", syncDoctors);
  $("resetButton").addEventListener("click", () => { if (confirm("Tüm randevular silinip örnek veriler yüklensin mi?")) { store.reset(); renderAll(); } });

  function renderAll() { renderStats(); renderSelects(); renderAppointments(); renderAdminData(); renderRole(); }
  renderAll();
})();
