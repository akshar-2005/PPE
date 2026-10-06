"""
Ground truth definitions for Mask detection testing in Phase 12.
Workers are 1-indexed (left to right by bounding box x1).
Every worker in every test image wears a helmet and a vest.
"""

GROUND_TRUTH_MASK = {
    "ppe12_mask.png": {
        1: {"helmet": True, "vest": True, "mask": True},
        2: {"helmet": True, "vest": True, "mask": False},
        3: {"helmet": True, "vest": True, "mask": True},
    },
    "ppe12_all_ppe.png": {
        1: {"helmet": True, "vest": True, "mask": True},
        2: {"helmet": True, "vest": True, "mask": True},
        3: {"helmet": True, "vest": True, "mask": True},
    },
    "ppe12_one_missing.png": {
        1: {"helmet": True, "vest": True, "mask": True},
        2: {"helmet": True, "vest": True, "mask": False},
        3: {"helmet": True, "vest": True, "mask": True},
    },
    "ppe12_gloves.png": {
        1: {"helmet": True, "vest": True, "mask": False},
        2: {"helmet": True, "vest": True, "mask": False},
        3: {"helmet": True, "vest": True, "mask": False},
    },
    "ppe12_goggles.png": {
        1: {"helmet": True, "vest": True, "mask": False},
        2: {"helmet": True, "vest": True, "mask": False},
        3: {"helmet": True, "vest": True, "mask": False},
    },
}
