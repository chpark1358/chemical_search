from __future__ import annotations

import re

from .models import NormalizedCompound


INCHI_KEY_RE = re.compile(r"^[A-Z]{14}-[A-Z]{10}-[A-Z]$")
FORMULA_RE = re.compile(r"^(?:[A-Z][a-z]?\d*){2,}$")


def _rdkit():
    try:
        from rdkit import Chem
        from rdkit.Chem import Descriptors, rdMolDescriptors
    except ImportError as exc:
        raise RuntimeError(
            "RDKit is required for structure normalization. "
            "Install scripts/chemical_search/requirements-poc.txt."
        ) from exc
    return Chem, Descriptors, rdMolDescriptors


def detect_input_type(value: str) -> str:
    value = value.strip()
    if INCHI_KEY_RE.fullmatch(value):
        return "inchi_key"
    if value.startswith("InChI="):
        return "inchi"

    try:
        Chem, _, _ = _rdkit()
        from rdkit import rdBase

        with rdBase.BlockLogs():
            if Chem.MolFromSmiles(value) is not None:
                return "smiles"
    except RuntimeError:
        # Formula/name detection remains useful before RDKit is installed.
        pass

    if FORMULA_RE.fullmatch(value):
        return "formula"
    return "name"


def normalize_structure(
    value: str,
    input_type: str,
    *,
    strip_salts: bool = True,
    preserve_stereochemistry: bool = True,
    names: list[str] | None = None,
) -> NormalizedCompound:
    Chem, Descriptors, rdMolDescriptors = _rdkit()
    warnings: list[str] = []

    from rdkit import rdBase

    with rdBase.BlockLogs():
        if input_type == "smiles":
            mol = Chem.MolFromSmiles(value)
        elif input_type == "inchi":
            mol = Chem.MolFromInchi(value)
        else:
            raise ValueError(f"Cannot normalize input type '{input_type}' without a resolved structure.")

    if mol is None:
        raise ValueError(f"RDKit could not parse the {input_type} input.")

    if strip_salts:
        from rdkit.Chem.MolStandardize import rdMolStandardize

        parent = rdMolStandardize.FragmentParent(mol)
        if parent.GetNumAtoms() != mol.GetNumAtoms():
            warnings.append("Salt or disconnected fragment was removed during normalization.")
        mol = parent

    canonical_smiles = Chem.MolToSmiles(
        mol,
        canonical=True,
        isomericSmiles=preserve_stereochemistry,
    )
    if not preserve_stereochemistry:
        warnings.append("Stereochemistry was not preserved.")

    return NormalizedCompound(
        original_input=value,
        detected_type=input_type,
        canonical_smiles=canonical_smiles,
        inchi_key=Chem.MolToInchiKey(mol),
        formula=rdMolDescriptors.CalcMolFormula(mol),
        molecular_weight=round(Descriptors.MolWt(mol), 4),
        names=names or [],
        warnings=warnings,
    )
