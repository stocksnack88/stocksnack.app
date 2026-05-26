"use client";
import { useEffect } from "react";

export default function NavHeightLogger() {
  useEffect(() => {
    const nav = document.querySelector("nav");
    const thead = document.querySelector("thead");
    const rows = thead?.querySelectorAll("tr");
    if (nav) console.log("Navbar height:", nav.offsetHeight);
    if (rows?.[0]) console.log("Header Row 1 height:", rows[0].offsetHeight);
    if (rows?.[1]) console.log("Header Row 2 height:", rows[1].offsetHeight);
  }, []);
  return null;
}
