package store.wonderfulcollection.admin.presentation.categories

import android.os.Bundle
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout
import kotlinx.coroutines.launch
import store.wonderfulcollection.admin.di.ServiceLocator
import store.wonderfulcollection.admin.domain.model.Category
import java.util.Locale

class CategoriesActivity : AppCompatActivity() {

    private lateinit var swipeRefresh: SwipeRefreshLayout
    private lateinit var listContainer: LinearLayout

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        swipeRefresh = SwipeRefreshLayout(this).apply {
            setBackgroundColor(0xFF0F172A.toInt())
            setOnRefreshListener { loadCategories() }
        }

        val scroll = ScrollView(this)
        val container = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(32, 48, 32, 48)
        }
        scroll.addView(container)
        swipeRefresh.addView(scroll)
        setContentView(swipeRefresh)

        // Header Row
        val headerRow = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            setPadding(0, 0, 0, 24)
        }

        val btnBack = Button(this).apply {
            text = "← Back"
            textSize = 12f
            setBackgroundColor(0xFF1E293B.toInt())
            setTextColor(0xFF38BDF8.toInt())
            setOnClickListener { finish() }
            layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT)
        }
        headerRow.addView(btnBack)

        val title = TextView(this).apply {
            text = "  🗂️ Categories"
            textSize = 22f
            setTextColor(0xFF0D9488.toInt())
            paint.isFakeBoldText = true
            layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
        }
        headerRow.addView(title)

        val btnAdd = Button(this).apply {
            text = "+ Add"
            textSize = 12f
            setBackgroundColor(0xFF0D9488.toInt())
            setTextColor(0xFFFFFFFF.toInt())
            setOnClickListener { showAddCategoryDialog() }
            layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT)
        }
        headerRow.addView(btnAdd)
        container.addView(headerRow)

        listContainer = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        container.addView(listContainer)

        loadCategories()
    }

    private fun loadCategories() {
        swipeRefresh.isRefreshing = true
        lifecycleScope.launch {
            ServiceLocator.getCategoriesUseCase().onSuccess { cats ->
                swipeRefresh.isRefreshing = false
                renderCategories(cats)
            }.onFailure {
                swipeRefresh.isRefreshing = false
                Toast.makeText(this@CategoriesActivity, "Failed to load categories", Toast.LENGTH_SHORT).show()
            }
        }
    }

    private fun renderCategories(cats: List<Category>) {
        listContainer.removeAllViews()
        if (cats.isEmpty()) {
            val emptyTv = TextView(this).apply {
                text = "No categories found."
                setTextColor(0xFF94A3B8.toInt())
                textSize = 15f
            }
            listContainer.addView(emptyTv)
            return
        }

        cats.forEach { c ->
            val card = LinearLayout(this).apply {
                orientation = LinearLayout.VERTICAL
                setBackgroundColor(0xFF1E293B.toInt())
                setPadding(24, 24, 24, 24)
                val lp = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT)
                lp.setMargins(0, 0, 0, 16)
                layoutParams = lp
            }

            val nameTv = TextView(this).apply {
                text = c.name
                textSize = 16f
                paint.isFakeBoldText = true
                setTextColor(0xFF38BDF8.toInt())
            }
            card.addView(nameTv)

            val subTv = TextView(this).apply {
                text = "Slug: ${c.slug}  |  Products: ${c.productCount}"
                textSize = 13f
                setTextColor(0xFFF8FAFC.toInt())
                setPadding(0, 6, 0, 0)
            }
            card.addView(subTv)

            listContainer.addView(card)
        }
    }

    private fun showAddCategoryDialog() {
        val input = EditText(this).apply {
            hint = "Category Name (e.g. Punjabi, Sharee)"
            inputType = android.text.InputType.TYPE_CLASS_TEXT or android.text.InputType.TYPE_TEXT_FLAG_CAP_WORDS
            setTextColor(0xFFF8FAFC.toInt())
            setPadding(32, 32, 32, 32)
        }
        val dialog = AlertDialog.Builder(this)
            .setTitle("Add New Category")
            .setView(input)
            .setPositiveButton("Create", null)
            .setNegativeButton("Cancel", null)
            .create()

        dialog.setOnShowListener {
            dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener {
                val name = input.text.toString().trim()
                if (name.isEmpty() || name.length > 150) {
                    input.error = "Enter a category name (up to 150 characters)."
                    return@setOnClickListener
                }

                val slug = name.lowercase(Locale.ROOT)
                    .replace(Regex("[^A-Za-z0-9-]+"), "-")
                    .trim('-')
                if (slug.isEmpty()) {
                    input.error = "Use a name with English letters or numbers so it can have a URL slug."
                    return@setOnClickListener
                }

                input.error = null
                val createButton = dialog.getButton(AlertDialog.BUTTON_POSITIVE)
                createButton.isEnabled = false
                lifecycleScope.launch {
                    ServiceLocator.categoryRepository.createCategory(name, slug)
                        .onSuccess {
                            Toast.makeText(
                                this@CategoriesActivity,
                                "Category '$name' created.",
                                Toast.LENGTH_SHORT
                            ).show()
                            dialog.dismiss()
                            loadCategories()
                        }
                        .onFailure { error ->
                            createButton.isEnabled = true
                            Toast.makeText(
                                this@CategoriesActivity,
                                error.message ?: "Could not create category. Please try again.",
                                Toast.LENGTH_LONG
                            ).show()
                        }
                }
            }
        }
        dialog.show()
    }
}
