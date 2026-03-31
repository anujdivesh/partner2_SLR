"use client";

import React from "react";
import CookIslandsSelector from "./CookIslandsSelector";

interface BuildingPanelProps {
  selectedCountry?: string;
  isBuildingLayerVisible?: boolean;
  onBuildingLayerToggle?: (visible: boolean) => void;
  buildingItems?: { id: string; name: string; useType: string; maxLoss: number }[];
  buildingSeaLevels?: string[];
  buildingReturnPeriods?: string[];
  selectedBuildingSeaLevel?: string;
  onBuildingSeaLevelChange?: (seaLevel: string) => void;
  selectedBuildingReturnPeriod?: string;
  onBuildingReturnPeriodChange?: (returnPeriod: string) => void;
  onBuildingSelect?: (id: string) => void;
  selectedIsland?: string;
}

export default function BuildingPanel(props: BuildingPanelProps) {
  return <CookIslandsSelector {...props} />;
}
