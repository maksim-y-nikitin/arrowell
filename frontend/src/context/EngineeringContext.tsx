/**
 * Engineering configuration context: Geomagnetic reference fields (WMM) and BHA sag mechanics.
 */

import React, { createContext, useContext, useState, useCallback } from 'react';
import { GeomagneticReference, BhaConfig } from '@/types';
import { initialGeoRef } from '@/data/wellsData';

export const initialBhaConfig: BhaConfig = {
  collarOdMm: 171.5,
  collarIdMm: 71.4,
  sensorToBitM: 14.2,
  stabilizerDistM: 21.5,
  mudWeightGcm3: 1.20,
  bhaMaterial: 'nm_steel',
};

/**
 * Calculates analytical beam deflection (Euler-Bernoulli) at MWD sensor position.
 */
export function calculatePhysicalSagAngle(bha: BhaConfig): number {
  const od = (bha?.collarOdMm || 171.5) / 1000;
  const id = (bha?.collarIdMm || 71.4) / 1000;
  const E = bha?.bhaMaterial === 'nm_steel' ? 1.90e11 : 2.05e11;
  const I = (Math.PI * (Math.pow(od, 4) - Math.pow(id, 4))) / 64;
  const EI = E * I;

  const rhoSteel = 7850;
  const rhoMud = (bha?.mudWeightGcm3 || 1.20) * 1000;
  const buoyancyFactor = Math.max(0.1, 1 - rhoMud / rhoSteel);

  const area = (Math.PI * (od * od - id * id)) / 4;
  const q = rhoSteel * area * 9.81 * buoyancyFactor;

  const L = Math.max(1, bha?.stabilizerDistM || 21.5);
  const x = Math.min(bha?.sensorToBitM || 14.2, L);

  const thetaRad = (q / (24 * EI)) * (Math.pow(L, 3) - 6 * L * x * x + 4 * Math.pow(x, 3));
  return Number(Math.abs(thetaRad * (180 / Math.PI)).toFixed(3));
}

interface EngineeringContextType {
  geoRef: GeomagneticReference;
  bhaConfig: BhaConfig;
  updateGeoRef: (partial: Partial<GeomagneticReference>) => void;
  updateBhaConfig: (partial: Partial<BhaConfig>) => void;
}

const EngineeringContext = createContext<EngineeringContextType | null>(null);

export const EngineeringProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [geoRef, setGeoRef] = useState<GeomagneticReference>(initialGeoRef);
  const [bhaConfig, setBhaConfig] = useState<BhaConfig>(initialBhaConfig);

  const updateGeoRef = useCallback((partial: Partial<GeomagneticReference>) => {
    setGeoRef((prev) => ({ ...prev, ...partial }));
  }, []);

  const updateBhaConfig = useCallback((partial: Partial<BhaConfig>) => {
    setBhaConfig((prev) => ({ ...prev, ...partial }));
  }, []);

  return (
    <EngineeringContext.Provider
      value={{
        geoRef,
        bhaConfig,
        updateGeoRef,
        updateBhaConfig,
      }}
    >
      {children}
    </EngineeringContext.Provider>
  );
};

export const useEngineering = () => {
  const ctx = useContext(EngineeringContext);
  if (!ctx) throw new Error('useEngineering must be used within EngineeringProvider');
  return ctx;
};