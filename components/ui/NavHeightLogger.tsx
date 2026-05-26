"use client";
import { useEffect } from "react";

export default function NavHeightLogger() {
  useEffect(() => {
    const nav = document.querySelector("nav");
    if (nav) console.log("Navbar height:", nav.offsetHeight);
  }, []);
  return null;
}
