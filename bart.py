import pymc as pm
import pymc_bart as pmb
import numpy as np
import pandas as pd
class BartImputer:
    def __init__(self, df, cols, max_iter=25, random_state=42):
        self.df = df.copy()
        self.cols = cols
        self.max_iter = max_iter
        self.random_state = random_state

    def impute(self):
        """
        Impute missing values in the specified columns of a DataFrame using BART (Bayesian Additive Regression Trees).

        Parameters:
        - df: pandas DataFrame with the data
        - cols: list of column names to impute

        Returns:
        - orig_values: list of original non-missing values in the columns
        - imputed_values: list of imputed values for the specified columns
        """
        RANDOM_SEED = self.random_state
        original_series = self.df[self.cols]
        mask = original_series.isna()
        # Separate columns with null values and those without
        null_cols = [col for col in self.cols if self.df[col].isnull().any()]
        # print('Columns with null values:', null_cols)
        x = [col for col in self.df.select_dtypes(include=[np.number]).columns if col not in null_cols and col not in self.cols]
        # print('Columns without null values:', x)

        X_full = self.df[x].copy()
        for col in self.cols:
            Y_full = self.df[col].copy()

            missing_indices = Y_full[Y_full.isnull()].index
            print(len(missing_indices))

            # Split observed and missing
            observed_mask = Y_full.notnull()
            X_observed = X_full[observed_mask]
            Y_observed = Y_full[observed_mask]
            X_missing = X_full[~observed_mask]


            # Define MutableData outside the model for future updates
            with pm.Model() as model_impute:
                X_data = pm.Data("X_data", X_observed)
                α = pm.Exponential("α", 1)
                μ = pmb.BART("μ", X_data, np.log(Y_observed + 1), m=50)
                y = pm.NegativeBinomial("y", mu=pm.math.exp(μ), alpha=α, observed=Y_observed)
                idata_impute = pm.sample(random_seed=RANDOM_SEED, target_accept=0.95)

            # Use posterior to predict missing targets
            with model_impute:
                pm.set_data({"X_data": X_missing})
                μ_post = pm.sample_posterior_predictive(idata_impute, var_names=["μ"], random_seed=RANDOM_SEED)

            # Use the median or mean of predicted values
            y_pred  = np.exp(μ_post.posterior_predictive["μ"]).mean(axis=(0, 1)) - 1
            Y_full_imputed = Y_full.copy()
            Y_full_imputed[~observed_mask] = y_pred

            # Display before vs after
            # print("Missing values before:", Y_full.isna().sum())
            # print("Missing values after:", Y_full_imputed.isna().sum())
            self.df[col] = Y_full_imputed

        orig_values = original_series.dropna()
        imputed_values = self.df.loc[mask.any(axis=1), self.cols]

        # Combine original and imputed values into a single column (Series)
        combined = self.df[self.cols].copy()
        if len(self.cols) == 1:
            combined = combined[self.cols[0]]

        return orig_values, imputed_values, combined
