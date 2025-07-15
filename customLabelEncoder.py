import pandas as pd
import numpy as np

class CustomLabelEncoder:
    def __init__(self, missing_marker='nan', treat_none_as_category=False):
        self.category_to_mean_map = {}
        self.missing_marker = missing_marker
        self.treat_none_as_category = treat_none_as_category

    def fit(self, df, categorical_column):
        """
        Fits the encoder by calculating the mean for each category in the categorical column,
        across all numerical columns in the DataFrame, ignoring NaNs in the calculations.

        Parameters:
        - df: pandas DataFrame with the data
        - categorical_column: str, name of the categorical column to transform

        Returns:
        - self: fitted encoder with a mapping of categories to their mean values
        """
        # Automatically detect numerical columns
        numerical_columns = df.select_dtypes(include=['int64', 'float64']).columns.tolist()

        # Handle None values based on the treat_none_as_category flag
        if self.treat_none_as_category:
            # Replace None with a custom marker if we treat None as a category
            df[categorical_column] = df[categorical_column].apply(lambda x: self.missing_marker if x is None or x == '' or x == np.nan else x)
        
        # Calculate the mean for each category across numerical columns, ignoring NaNs
        category_means = df.groupby(categorical_column)[numerical_columns].mean()

        # Average across all numerical columns to get a single mean per category
        self.category_to_mean_map = category_means.mean(axis=1, skipna=True).to_dict()

        if not self.treat_none_as_category:
            self.category_to_mean_map['nan'] = np.nan

        # Ensure the missing marker is handled
        if self.missing_marker not in self.category_to_mean_map:
            self.category_to_mean_map[self.missing_marker] = np.nan

        return self

    def transform(self, data):
        """
        Transforms the categorical data using the precomputed mean mapping.
        Any unseen categories will be set to NaN.
        """
        # If treat_none_as_category is False, replace None with NaN in the data
        if not self.treat_none_as_category:
            data = data.apply(lambda x: np.nan if x is None or x == '' or x == np.nan else x)

        print(self.category_to_mean_map)

        # Map categories to the precomputed mean values, handling unseen categories
        return data.map(self.category_to_mean_map)

    def fit_transform(self, df, categorical_column):
        """
        Fits and transforms the categorical data in a single step.
        """
        return self.fit(df, categorical_column).transform(df[categorical_column])

    def handle_missing_category(self, data):
        """
        Leaves NaN values as is, without replacing them.
        """
        return data
