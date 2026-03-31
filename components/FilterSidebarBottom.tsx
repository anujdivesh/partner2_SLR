"use client";

import React from "react";
import SidebarBottomAverageLoss from './SidebarBottomAverageLoss';

interface FilterSidebarBottomProps {
  selectedCountry?: string;
  selectedIsland?: string;
  cardinalDirection?: string;
}

export default function FilterSidebarBottom({
  selectedCountry,
  selectedIsland,
  cardinalDirection,
}: FilterSidebarBottomProps) {
  // This component now acts as a wrapper or router for different bottom panel views.
  // Currently, it only renders the Average Loss View, but it can be expanded later.
  return (
    <SidebarBottomAverageLoss
      selectedCountry={selectedCountry}
      selectedIsland={selectedIsland}
      cardinalDirection={cardinalDirection}
    />
  );
}
