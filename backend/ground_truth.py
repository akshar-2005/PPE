"""
Ground truth definitions for PPE Vision testing.
Workers are 1-indexed (left to right by bounding box x1).
Every worker in every test image wears a helmet and a vest.
"""

GROUND_TRUTH = {
    "ppe12_gloves.png": {
        1: {"helmet": True, "vest": True, "gloves": True, "goggles": False, "mask": False},
        2: {"helmet": True, "vest": True, "gloves": False, "goggles": False, "mask": False},
        3: {"helmet": True, "vest": True, "gloves": True, "goggles": False, "mask": False},
    },
    "ppe12_goggles.png": {
        1: {"helmet": True, "vest": True, "gloves": True, "goggles": True, "mask": False},
        2: {"helmet": True, "vest": True, "gloves": False, "goggles": False, "mask": False},
        3: {"helmet": True, "vest": True, "gloves": True, "goggles": True, "mask": False},
    },
    "ppe12_mask.png": {
        1: {"helmet": True, "vest": True, "gloves": True, "goggles": False, "mask": True},
        2: {"helmet": True, "vest": True, "gloves": False, "goggles": False, "mask": False},
        3: {"helmet": True, "vest": True, "gloves": True, "goggles": False, "mask": True},
    },
    "ppe12_all_ppe.png": {
        1: {"helmet": True, "vest": True, "gloves": True, "goggles": True, "mask": True},
        2: {"helmet": True, "vest": True, "gloves": True, "goggles": True, "mask": True},
        3: {"helmet": True, "vest": True, "gloves": True, "goggles": True, "mask": True},
    },
    "ppe12_one_missing.png": {
        1: {"helmet": True, "vest": True, "gloves": True, "goggles": True, "mask": True},
        2: {"helmet": True, "vest": True, "gloves": True, "goggles": True, "mask": False},
        3: {"helmet": True, "vest": True, "gloves": False, "goggles": True, "mask": True},
    },
}
