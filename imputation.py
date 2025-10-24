import numpy as np
import pandas as pd

def impute_death_rate(index, cdc_data, distance_matrix, k=5, allowed_indices=None):
    """
    Impute the death rate (Deaths_per_100k) for a given county using its top-k valid neighbors.

    Method:
      • Use the county's socio-economic index ('Socio_Index') to read the corresponding row in the
        combined distance matrix.
      • Select the k nearest neighbors that have a valid Deaths_per_100k (and, if provided, whose
        row indices are in allowed_indices).
      • Compute an inverse-distance weighted average of the neighbors' Deaths_per_100k. If any
        neighbor has zero distance, average only those zero-distance neighbors (tie case).

    Parameters:
        index (int): Row index in cdc_data for the county to impute.
        cdc_data (pd.DataFrame): Must contain columns ['Socio_Index', 'Deaths_per_100k'].
        distance_matrix (np.ndarray): Square matrix aligned to the master socio index space.
        k (int): Number of neighbors.
        allowed_indices (iterable[int] or None): If provided, donor pool is restricted to these row indices of cdc_data.

    Returns:
        (float, dict): (imputed_value, neighbor_map) where neighbor_map maps the target county's
        identifier (e.g., 'County Code' or 'GEOID') to a list of donor identifiers.
    """

    # ----------------------------
    # Basic assertions to surface misalignment early
    # ----------------------------
    if not isinstance(distance_matrix, np.ndarray):
        raise TypeError("distance_matrix must be a NumPy ndarray.")

    if distance_matrix.ndim != 2 or distance_matrix.shape[0] != distance_matrix.shape[1]:
        raise ValueError("distance_matrix must be a square 2D array.")

    if 'Socio_Index' not in cdc_data.columns:
        raise KeyError("cdc_data must contain a 'Socio_Index' column.")
    if 'Deaths_per_100k' not in cdc_data.columns:
        raise KeyError("cdc_data must contain a 'Deaths_per_100k' column.")

    # The row we are imputing
    socio_index = cdc_data.loc[index, 'Socio_Index']
    # Handle accidental Series (e.g., duplicate index)
    socio_index = socio_index.iloc[0] if isinstance(socio_index, pd.Series) else socio_index

    if pd.isna(socio_index):
        return (np.nan, {})  # cannot impute without a valid socio index

    socio_index = int(socio_index)

    n_master = distance_matrix.shape[0]
    if socio_index < 0 or socio_index >= n_master:
        raise IndexError(f"Socio_Index {socio_index} out of bounds for distance_matrix of size {n_master}.")

    # If allowed_indices is provided, ensure they are valid row indices of cdc_data
    if allowed_indices is not None:
        allowed_indices = set(int(i) for i in allowed_indices)
        # Do not allow the target row as a donor
        if index in allowed_indices:
            allowed_indices = set(i for i in allowed_indices if i != index)

    # ----------------------------
    # Neighbor search in master space
    # ----------------------------
    distances = distance_matrix[socio_index]

    # Stable argsort; exclude self explicitly
    sorted_indices = np.argsort(distances, kind="mergesort")
    sorted_indices = sorted_indices[sorted_indices != socio_index]

    valid_neighbors = []
    seen_socio = set()

    for neighbor_socio in sorted_indices:
        if neighbor_socio in seen_socio:
            continue
        if len(valid_neighbors) >= k:
            break

        # Find all rows in cdc_data with this socio index
        donor_rows = cdc_data.index[cdc_data['Socio_Index'] == neighbor_socio].tolist()
        if not donor_rows:
            continue

        # Enforce allowed_indices constraint at the *row* level (if provided)
        if allowed_indices is not None:
            donor_rows = [ri for ri in donor_rows if ri in allowed_indices]
            if not donor_rows:
                continue

        # Choose the first donor row with a non-NaN target
        donor_row = None
        for ri in donor_rows:
            val = cdc_data.at[ri, 'Deaths_per_100k']
            val = val.iloc[0] if isinstance(val, pd.Series) else val
            if pd.notna(val):
                donor_row = ri
                break
        if donor_row is None:
            continue

        val = cdc_data.loc[donor_row, 'Deaths_per_100k']
        val = val.iloc[0] if isinstance(val, pd.Series) else val
        death_rate = float(val)
        valid_neighbors.append((neighbor_socio, death_rate))
        seen_socio.add(neighbor_socio)

    if not valid_neighbors:
        raise ValueError("No valid neighbors found for imputation (check train/test split and allowed_indices).")

    neighbor_socio_indices = np.array([item[0] for item in valid_neighbors], dtype=int)
    neighbor_rates = np.array([item[1] for item in valid_neighbors], dtype=float)
    donor_rows_used = [item[0] for item in valid_neighbors]

    neighbor_distances = distances[neighbor_socio_indices]

    # ----------------------------
    # Weighting: handle exact ties at zero distance cleanly
    # ----------------------------
    zero_mask = (neighbor_distances <= 0.0)
    if np.any(zero_mask):
        # If any neighbor is exactly at zero distance, average those neighbors only
        imputed_value = float(np.mean(neighbor_rates[zero_mask]))
    else:
        eps = 1e-8
        weights = 1.0 / (neighbor_distances + eps)
        imputed_value = float(np.sum(weights * neighbor_rates) / np.sum(weights))

    # ----------------------------
    # Build donor map using human-readable county identifiers when available
    # ----------------------------

    def _get_identifier(row_idx):
        mask = cdc_data['Socio_Index'] == row_idx
        county_codes = cdc_data.loc[mask, 'County Code']

        if not county_codes.empty:
            return county_codes.iloc[0]     # first matching county code
        return ''
    
    target_identifier = _get_identifier(socio_index)
    donor_identifiers = [_get_identifier(row_idx) for row_idx in donor_rows_used]

    neighbor_map = {target_identifier: donor_identifiers}
    # print("neighbor_map: ", neighbor_map)

    return (imputed_value, neighbor_map)