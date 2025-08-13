import numpy as np
import pandas as pd

def impute_death_rate(index, cdc_data, distance_matrix, k=5, allowed_indices=None):
    
    """
        Impute the death rate (Deaths_per_100k) for a given county using its top k valid neighbors.
        
        The method:
        - Uses the county's socio-economic index (assumed to be stored in 'Socio_Index' in cdc_data)
        - Retrieves the distances from the combined distance matrix (distance_matrix)
        - Selects the k nearest neighbors that have a valid Deaths_per_100k value
        - Computes a weighted average of the neighbors' Deaths_per_100k using the inverse of their distance as weight
        
        Parameters:
            index (int): Index of the county (row in cdc_data) for which to impute the death rate.
            cdc_data (pd.DataFrame): DataFrame containing the death rate data and associated columns.
                                    It must contain 'Deaths_per_100k' and 'Socio_Index'.
            distance_matrix (np.array): A precomputed combined distance matrix where the rows and columns correspond 
                                        to the counties (in the same order as in cdc_data).
            k (int): The number of neighbors to use for imputation (default is 5).
        
        Returns:
            float: The imputed Deaths_per_100k value for the given county.
    """
    
    socio_index = cdc_data.loc[index, 'Socio_Index']
    # print("Imputing", cdc_data.loc[index, 'County Code'], socio_index) 
    # print(f"IMP for index {index} socio_index: {socio_index}")

    socio_index = socio_index.iloc[0] if isinstance(socio_index, pd.Series) else socio_index #if duplicate indix in training data

    if pd.isna(socio_index):
        return (np.nan, {})  # Cannot impute if no socio-economic index is available
    
    socio_index = int(socio_index)
    
    distances = distance_matrix[socio_index]
    
    sorted_indices = np.argsort(distances)[1:]
    
    # Find the top k valid neighbors that have a reliable Deaths_per_100k
    # print("sorted_indices: ", len(sorted_indices))
    valid_neighbors = []
    seen = set()
    for neighbor_idx in sorted_indices:
        if neighbor_idx in seen:
            continue

        if len(valid_neighbors) >= k:
            break
        
        # Enforce allowed_indices constraint
        if allowed_indices is not None:
            # Find row indices in cdc_data with this socio_index
            row_indices = cdc_data[cdc_data['Socio_Index'] == neighbor_idx].index
            if not any(idx in allowed_indices for idx in row_indices):
                continue

        # Check if the neighbor exists in the CDC data based on socio_index.
        # Here we assume that the CDC data contains a 'Socio_Index' column that aligns with the distance matrix indices.
        if neighbor_idx in cdc_data['Socio_Index'].values:
            candidate = cdc_data.loc[cdc_data['Socio_Index'] == neighbor_idx, 'Deaths_per_100k']

            if not candidate.isna().all():
                death_rate = candidate.values[0] # Get the first occurrence if there are multiple
                valid_neighbors.append((neighbor_idx, death_rate))
                seen.add(neighbor_idx)
    
    if not valid_neighbors:
        raise ValueError("No Valid Neighbors found")
    
    neighbor_indices, neighbor_rates = zip(*valid_neighbors)
    
    neighbor_distances = distances[list(neighbor_indices)]
    
    epsilon = 1e-8
    weights = 1 / (neighbor_distances + epsilon)
    
    imputed_value = np.sum(weights * np.array(neighbor_rates)) / np.sum(weights)

    neighbor_map = {str(index): [str(i) for i in neighbor_indices]}
    
    return (imputed_value, neighbor_map)