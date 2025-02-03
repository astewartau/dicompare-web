import json
from dicompare.compliance import check_session_compliance_with_json_reference, check_session_compliance_with_python_module

if is_json:
    series_map = {
        tuple(k.split("::")): tuple(v.split("::"))
        for k, v in json.loads(finalized_mapping).items()
    }
    compliance_summary = check_session_compliance_with_json_reference(
        in_session=in_session, ref_session=ref_session, session_map=series_map
    )
else:
    acquisition_map = {
        k.split("::")[0]: v
        for k, v in json.loads(finalized_mapping).items()
    }
    compliance_summary = check_session_compliance_with_python_module(
        in_session=in_session, ref_models=ref_models, session_map=acquisition_map
    )

json.dumps(compliance_summary)