import json
from dicompare.io import load_json_session, load_python_session, load_dicom_session
from dicompare.mapping import map_to_json_reference

# Load the reference and input sessions
if is_json:
    reference_fields, ref_session = load_json_session(json_ref=ref_path)
else:
    ref_models = load_python_session(module_path=ref_path)
    ref_session = {"acquisitions": {k: {} for k in ref_models.keys()}}
acquisition_fields = ["ProtocolName"]

in_session = load_dicom_session(
    dicom_bytes=dicom_files,
    acquisition_fields=acquisition_fields
)
if in_session is None:
    raise ValueError("Failed to load the DICOM session. Ensure the input data is valid.")
if in_session.empty:
    raise ValueError("The DICOM session is empty. Ensure the input data is correct.")

input_acquisitions = list(in_session['Acquisition'].unique())

if is_json:
    in_session = in_session.reset_index(drop=True)

    in_session["Series"] = (
        in_session.groupby(acquisition_fields).apply(
            lambda group: group.groupby(reference_fields, dropna=False).ngroup().add(1)
        ).reset_index(level=0, drop=True)  # Reset multi-index back to DataFrame
    ).apply(lambda x: f"Series {x}")
    in_session.sort_values(by=["Acquisition", "Series"] + acquisition_fields + reference_fields, inplace=True)

    missing_fields = [field for field in reference_fields if field not in in_session.columns]
    if missing_fields:
        raise ValueError(f"Input session is missing required reference fields: {missing_fields}")

    session_map = map_to_json_reference(in_session, ref_session)
    session_map_serializable = {
        f"{key[0]}::{key[1]}": f"{value[0]}::{value[1]}"
        for key, value in session_map.items()
    }
    # print session map
    print(json.dumps(session_map_serializable, indent=2))
else:
    # Map acquisitions directly for Python references
    session_map_serializable = {
        acquisition: ref
        for acquisition, ref in zip(input_acquisitions, ref_session["acquisitions"])
    }

json.dumps({
    "reference_acquisitions": ref_session["acquisitions"],
    "input_acquisitions": input_acquisitions,
    "session_map": session_map_serializable
})