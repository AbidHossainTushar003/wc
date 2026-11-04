package store.wonderfulcollection.admin.presentation.base

/**
 * Standard UI State wrapper for MVVM ViewModels.
 */
sealed class Resource<out T> {
    object Loading : Resource<Nothing>()
    data class Success<out T>(val data: T) : Resource<T>()
    data class Error(val message: String) : Resource<Nothing>()
}

