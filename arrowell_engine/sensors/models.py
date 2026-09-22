"""15-Parameter Directional and Inclination (D&I) sensor error model.

Includes biases, scale factors, and cross-axis misalignments for triaxial
accelerometers and magnetometers based on ISCWSA tool error specifications.
"""

from dataclasses import dataclass

import numpy as np


@dataclass(slots=True)
class SensorCalibrationParams:
    abx: float = 0.0  # Accel X Bias
    aby: float = 0.0  # Accel Y Bias
    abz: float = 0.0  # Accel Z Bias
    asx: float = 0.0  # Accel X Scale Factor
    asy: float = 0.0  # Accel Y Scale Factor
    asz: float = 0.0  # Accel Z Scale Factor
    mbx: float = 0.0  # Mag X Bias
    mby: float = 0.0  # Mag Y Bias
    mbz: float = 0.0  # Mag Z Bias (Axial Drillstring Interference)
    msx: float = 0.0  # Mag X Scale Factor
    msy: float = 0.0  # Mag Y Scale Factor
    msz: float = 0.0  # Mag Z Scale Factor
    mxy: float = 0.0  # Sensor block misalignment XY (rad)
    mxz: float = 0.0  # Sensor block misalignment XZ (rad)
    myz: float = 0.0  # Sensor block misalignment YZ (rad)

    def to_array(self) -> np.ndarray:
        """Export calibration parameters to a 15-element NumPy array."""
        return np.array([
            self.abx, self.aby, self.abz,
            self.asx, self.asy, self.asz,
            self.mbx, self.mby, self.mbz,
            self.msx, self.msy, self.msz,
            self.mxy, self.mxz, self.myz,
        ], dtype=np.float64)

    @classmethod
    def from_array(cls, arr: np.ndarray) -> "SensorCalibrationParams":
        """Construct calibration parameters from a 15-element array."""
        return cls(*arr[:15].tolist())


def apply_sensor_correction(
    raw_dni: np.ndarray,  # Shape: (N, 6) -> [gx, gy, gz, bx, by, bz]
    params: np.ndarray,   # Shape: (15,)
) -> np.ndarray:
    """Apply sensor calibration coefficients to raw survey measurements."""
    cor = np.empty_like(raw_dni, dtype=np.float64)

    # Accelerometers: Scale factor and bias
    cor[:, 0] = raw_dni[:, 0] / (1.0 + params[3]) - params[0]
    cor[:, 1] = raw_dni[:, 1] / (1.0 + params[4]) - params[1]
    cor[:, 2] = raw_dni[:, 2] / (1.0 + params[5]) - params[2]

    # Magnetometers: Scale factor and bias
    bx_s = raw_dni[:, 3] / (1.0 + params[9]) - params[6]
    by_s = raw_dni[:, 4] / (1.0 + params[10]) - params[7]
    bz_s = raw_dni[:, 5] / (1.0 + params[11]) - params[8]

    # Magnetometer-to-accelerometer frame misalignments
    mxy, mxz, myz = params[12], params[13], params[14]
    cor[:, 3] = bx_s - mxy * by_s - mxz * bz_s
    cor[:, 4] = by_s + mxy * bx_s - myz * bz_s
    cor[:, 5] = bz_s + mxz * bx_s + myz * by_s

    return cor