from scipy.spatial.distance import pdist, squareform
import pandas as pd
import numpy as np


def compute_socio_distance(df):

    socio_data = df.to_numpy()
    Dsoc = squareform(pdist(socio_data, metric="euclidean"))

    #standardize
    # Dsoc = (Dsoc - Dsoc.mean()) / Dsoc.std() #cause negative distance

    # Apply min-max scaling so distances fall between 0 and 1
    Dsoc = (Dsoc - Dsoc.min()) / (Dsoc.max() - Dsoc.min())

    return Dsoc

def compute_mahalanobis_distance(df):
    """
    Compute the Mahalanobis distance matrix for a given 2D array of data.
    """
    data = df.to_numpy()

    # Compute the covariance matrix (using rows as observations)
    cov_matrix = np.cov(data, rowvar=False)
    
    # Compute the inverse of the covariance matrix
    # (You may want to add regularization if the covariance matrix is nearly singular.)
    VI = np.linalg.inv(cov_matrix)
    
    # Compute the pairwise Mahalanobis distances
    distances = pdist(data, metric='mahalanobis', VI=VI)
    
    # Convert the condensed distance matrix to a square matrix
    D_mahalanobis = squareform(distances)
    #standardize
    D_mahalanobis = (D_mahalanobis - D_mahalanobis.mean()) / D_mahalanobis.std()

    return D_mahalanobis

def compute_geo_distance(df):

    geo_data = df[["lat", "lng"]].to_numpy()
    Dgeo = squareform(pdist(geo_data, metric="euclidean"))

    #standardize
    # Dgeo = (Dgeo - Dgeo.mean()) / Dgeo.std()

    # Apply min-max scaling for consistency
    Dgeo = (Dgeo - Dgeo.min()) / (Dgeo.max() - Dgeo.min())

    return Dgeo
