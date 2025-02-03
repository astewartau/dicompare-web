import json
import pandas as pd
from dicompare.io import load_dicom_session

def make_hashable(value):
    """Recursively convert lists/dicts to hashable JSON or tuples."""
    if isinstance(value, (list, dict)):
        return json.dumps(value, sort_keys=True)
    elif isinstance(value, (set, tuple)):
        return tuple(make_hashable(v) for v in value)
    return value

def load_dicom_data(dicom_bytes):
    """Load DICOM session data and return as a Pandas DataFrame."""
    session = load_dicom_session(dicom_bytes=dicom_bytes, acquisition_fields=['ProtocolName'])
    return session.reset_index(drop=True)

def get_unique_acquisitions(df):
    """Retrieve a list of unique ProtocolNames from the DataFrame."""
    return df['ProtocolName'].unique().tolist()

def get_dataframe_columns(df):
    """Return a list of column names from the DataFrame."""
    return list(df.columns)

def fetch_unique_rows(df, acquisition, selected_fields):
    """Fetch unique rows based on selected fields for a given acquisition."""
    if not selected_fields:
        return []

    if any(field not in df.columns for field in selected_fields):
        raise ValueError(f"One or more selected fields are missing in df.columns: {selected_fields}")

    df_selected = df[df['ProtocolName'] == acquisition][selected_fields].copy()
    df_selected.columns = df_selected.columns.str.strip()

    for col in df_selected.columns:
        df_selected[col] = df_selected[col].apply(make_hashable)

    df_selected.drop_duplicates(subset=selected_fields, inplace=True)

    if set(selected_fields).intersection(df_selected.columns):
        df_selected.sort_values(by=selected_fields, ascending=True, inplace=True)

    return df_selected.to_dict(orient='records')

def get_constant_fields(rows, fields):
    """Determine which fields have constant values across all rows."""
    constant_fields = {}
    variable_fields = fields.copy()

    if not rows or not fields:
        return constant_fields, variable_fields

    for field in fields:
        first_value = rows[0].get(field, None)
        is_constant = all(make_hashable(row.get(field, None)) == make_hashable(first_value) for row in rows)

        if is_constant:
            constant_fields[field] = first_value
            variable_fields.remove(field)

    return constant_fields, variable_fields

def fetch_sorted_unique_rows(df, acquisition, selected_fields):
    """Fetch sorted unique rows with an optional Series index."""
    df_filtered = df[df['ProtocolName'] == acquisition][selected_fields].drop_duplicates()
    df_filtered.sort_values(by=selected_fields, inplace=True)

    if len(df_filtered) > 1:
        df_filtered.insert(0, 'Series', range(1, len(df_filtered) + 1))

    return df_filtered.to_dict(orient='records')