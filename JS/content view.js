export const header = document.getElementById("header");
export const tabsContainer = document.getElementById("tabs");
export const tabs = document.querySelectorAll(".tab");
export const contentField = document.getElementById("content-field");

export function updateContentField(tabId) {
  contentField.style.height =
    window.innerHeight -
    header.offsetHeight -
    tabsContainer.offsetHeight +
    "px";
}

tabs.forEach((tab) => {
  tab.style.width =
    Math.max(...Array.from(tabs).map((t) => t.offsetWidth)) + 1 + "px";
  tab.addEventListener("click", () => {
    tabs.forEach((t) => t.classList.remove("active"));
    tab.classList.add("active");
    updateContentField(tab.id);
  });
});

window.addEventListener("resize", () => {
  updateContentField(document.querySelector(".tab.active").id);
});
