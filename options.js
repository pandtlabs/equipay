const STORAGE_KEY = "complainant";

const FIELDS = [
  "firstName",
  "lastName",
  "email",
  "phone",
  "address1",
  "address2",
  "city",
  "state",
  "zip",
  "county",
];

const form = document.getElementById("form");
const statusEl = document.getElementById("status");

function flashStatus(msg) {
  statusEl.textContent = msg;
  setTimeout(() => {
    statusEl.textContent = "";
  }, 1800);
}

async function load() {
  const { [STORAGE_KEY]: saved = {} } = await chrome.storage.local.get(
    STORAGE_KEY
  );
  for (const field of FIELDS) {
    const input = form.elements.namedItem(field);
    if (input && saved[field] != null) input.value = saved[field];
  }
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const data = {};
  for (const field of FIELDS) {
    const input = form.elements.namedItem(field);
    if (input) data[field] = input.value.trim();
  }
  await chrome.storage.local.set({ [STORAGE_KEY]: data });
  flashStatus("Saved.");
});

document.getElementById("clear").addEventListener("click", async () => {
  await chrome.storage.local.remove(STORAGE_KEY);
  form.reset();
  form.elements.namedItem("state").value = "NY";
  flashStatus("Cleared.");
});

load();
